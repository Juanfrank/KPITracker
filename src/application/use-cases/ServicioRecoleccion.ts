import {
  CLAVE_GENERAL, EntidadNoEncontradaError, EvaluadorFormulas, GeneradorPeriodos, Periodicidad,
  ProductoCartesiano, TipoDato, ValidacionError, calcularAgregadosCaptura, claveATexto, crearClave,
  equipoEfectivo, etiquetaMasReciente, evaluarValidacionesCaptura, ordenarComoArbol, puedeSobreIndicador,
  resolverParametrosGenerales, sustituirTokens
} from '@domain/index';
import type {
  AccionResultado, DefinicionPeriodicidad, ElementoLista, Indicador, Levantamiento, OrigenAutomatico, Periodo,
  Resultado, ResultadoHistorial, TypeRegistry
} from '@domain/index';
import type {
  IAtributoRepository, IAutomatizacionIndicadorRepository, ICatalogoRepository, IConectorOrigen,
  IConfiguracionRepository, IDefinicionPeriodicidadRepository, IIndicadorRepository,
  IListaRepository, IReglaRepository, IResultadoRepository, IUsuarioRepository
} from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';
import { permisosActuales, usuarioActual } from './contextoUsuario';

/** Resumen de una ejecución automática que escribió resultados directamente en la grilla de captura. */
export interface ResultadoObtencionAutomatica {
  celdasActualizadas: number;
  filasConError: number;
  desagregacionesSinMapear: string[];
}

export interface FilaCaptura {
  claveDesagregacion: string;
  /** Solo las desagregaciones PRESENTES en esta fila (ausente = enrollada/subtotal en ella; ver ProductoCartesiano). */
  etiquetas: Array<{ listaId: string; listaNombre: string; codigo: string; descripcion: string }>;
  /**
   * La desagregación+valor que distingue esta fila de su fila padre en el
   * árbol de exploración (ver ArbolDesagregaciones) — `null` para General.
   * Es exactamente la que corresponde "drillear" al expandir la fila padre:
   * las filas ya llegan ordenadas en recorrido en profundidad (incluida
   * esta fila) con `etiquetas.length` como profundidad, así que el
   * renderer arma la jerarquía completa con solo este campo + ese orden,
   * sin reimplementar la regla de padre/hijo.
   */
  etiquetaReciente: { listaId: string; listaNombre: string; descripcion: string } | null;
  esGeneral: boolean;
  /** true en el nivel intermedio del cubo (algunas desagregaciones presentes, otras enrolladas) — ni General ni detalle completo. */
  esSubtotal: boolean;
  /** true solo cuando TODAS las desagregaciones activas están presentes (el nivel más fino, el único que existía antes del cubo). */
  esDetalleCompleto: boolean;
  valor: number | null;
  observacion: string | null;
  actualizadoEn: string | null;
  /** Estado de validación post-registro (Batch T) — 'Pendiente' si la celda todavía no tiene resultado guardado. */
  estadoValidacion: 'Pendiente' | 'Validado' | 'Rechazado';
  comentarioValidacion: string | null;
}

export interface DatosCaptura {
  indicadorId: string;
  periodoId: string;
  periodoEtiqueta: string;
  fechaCorte: string | null;
  /** Comentario opcional del levantamiento (indicador+período, no por celda). */
  comentario: string | null;
  desagregacionesDisponibles: Array<{ listaId: string; nombre: string; excluida: boolean }>;
  filas: FilaCaptura[];
  /** Advertencias no bloqueantes (validación cruzada del levantamiento). */
  advertencias: string[];
}

/**
 * Caso de uso central de la Recolección: arma la grilla de captura
 * (producto cartesiano + fila General + exclusiones temporales), y persiste
 * cada celda de forma automática (sin botón Guardar) con validación y
 * auditoría de valor anterior/nuevo. Evalúa además reglas `ValidacionCruzada`
 * de entidad `Recoleccion` sobre agregados del levantamiento (General,
 * Máximo, Mínimo, Suma, Promedio...), siempre como advertencias, nunca
 * bloqueantes.
 */
export class ServicioRecoleccion extends ServicioBase {
  private readonly generadorPeriodos = new GeneradorPeriodos();
  private readonly productoCartesiano = new ProductoCartesiano();
  private readonly formulas = new EvaluadorFormulas();

  constructor(
    ctx: ContextoAplicacion,
    private readonly indicadores: IIndicadorRepository,
    private readonly listas: IListaRepository,
    private readonly resultados: IResultadoRepository,
    private readonly configuracion: IConfiguracionRepository,
    private readonly periodicidadesRepo: IDefinicionPeriodicidadRepository,
    private readonly reglasRepo: IReglaRepository,
    private readonly tipos: TypeRegistry,
    private readonly automatizaciones: IAutomatizacionIndicadorRepository,
    private readonly origenesAutomaticos: ICatalogoRepository<OrigenAutomatico>,
    private readonly atributosRepo: IAtributoRepository,
    private readonly conector: IConectorOrigen,
    private readonly usuariosRepo: IUsuarioRepository
  ) {
    super(ctx);
  }

  /**
   * Resuelve el indicador y exige, según el permiso efectivo del usuario en
   * curso (`permisosActuales()`, ver `contextoUsuario.ts`), que pueda
   * `accion` sobre él (Batch T) — admin, permiso general, permiso de su
   * propio equipo, o ser su responsable directo (nunca para `'validar'`),
   * ver `puedeSobreIndicador`. Único punto de gating: todo método público
   * que lee/escribe resultados de un indicador concreto pasa por acá.
   */
  private async indicadorConPermiso(indicadorId: string, accion: AccionResultado): Promise<Indicador> {
    const indicador = await this.indicadores.obtener(indicadorId);
    if (!indicador) throw new EntidadNoEncontradaError('Indicador', indicadorId);
    const responsable = indicador.responsable ? await this.usuariosRepo.obtener(indicador.responsable) : null;
    const usuariosPorId = new Map(responsable ? [[responsable.id, { equipoId: responsable.equipoId }] as const] : []);
    const equipoEfectivoId = equipoEfectivo(indicador, usuariosPorId);
    if (!puedeSobreIndicador(permisosActuales(), accion, { equipoEfectivoId, responsable: indicador.responsable })) {
      throw new ValidacionError('No tiene permiso para esta acción sobre este indicador.');
    }
    return indicador;
  }

  /** Resuelve la definición de periodicidad personalizada del indicador, si aplica. */
  private async definicionPara(indicador: Indicador): Promise<DefinicionPeriodicidad | undefined> {
    if (indicador.periodicidad !== Periodicidad.Personalizada || !indicador.periodicidadPersonalizadaId) {
      return undefined;
    }
    return (await this.periodicidadesRepo.obtener(indicador.periodicidadPersonalizadaId)) ?? undefined;
  }

  /** Períodos disponibles según periodicidad del indicador y año inicial global. */
  async periodosDisponibles(indicadorId: string): Promise<Periodo[]> {
    const indicador = await this.indicadorConPermiso(indicadorId, 'ver');
    const config = await this.configuracion.obtener();
    const definicion = await this.definicionPara(indicador);
    return this.generadorPeriodos.periodosDisponibles(config.anioInicial, indicador.periodicidad, this.ctx.reloj.hoyIso(), definicion);
  }

  async obtenerCaptura(indicadorId: string, periodoId: string): Promise<DatosCaptura> {
    const indicador = await this.indicadorConPermiso(indicadorId, 'ver');

    if (indicador.esCalculado && indicador.formula) {
      const valor = await this.calcularValorIndicador(indicador.formula, periodoId);
      const definicion = await this.definicionPara(indicador);
      return {
        indicadorId,
        periodoId,
        periodoEtiqueta: this.etiquetaPeriodo(periodoId, definicion),
        fechaCorte: null,
        comentario: null,
        desagregacionesDisponibles: [],
        filas: [{
          claveDesagregacion: 'GENERAL',
          etiquetas: [],
          etiquetaReciente: null,
          esGeneral: true,
          esSubtotal: false,
          esDetalleCompleto: false,
          valor,
          observacion: null,
          actualizadoEn: null,
          estadoValidacion: 'Pendiente',
          comentarioValidacion: null
        }],
        advertencias: []
      };
    }

    const levantamiento = await this.resultados.obtenerLevantamiento(indicadorId, periodoId);
    const excluidas = levantamiento?.desagregacionesExcluidas ?? [];

    const elementosPorLista = new Map<string, ElementoLista[]>();
    const nombresListas = new Map<string, string>();
    for (const listaId of indicador.desagregaciones) {
      const lista = await this.listas.obtener(listaId);
      nombresListas.set(listaId, lista?.nombre ?? listaId);
      elementosPorLista.set(listaId, await this.listas.listarElementos(listaId));
    }

    const combinacionesCubo = this.productoCartesiano.generar(indicador.desagregaciones, elementosPorLista, excluidas);
    // Reordenadas como árbol de "drill-down" en el orden en que se configuraron
    // las desagregaciones del indicador — ver ArbolDesagregaciones. `nivel`
    // (ya presente en cada combinación) coincide con la profundidad en este
    // árbol, así que alcanza para que el renderer arme expansión/colapso.
    const combinaciones = ordenarComoArbol(combinacionesCubo, indicador.desagregaciones);
    const totalDesagregacionesActivas = indicador.desagregaciones.filter((id) => !excluidas.includes(id)).length;
    const existentes = await this.resultados.obtenerPorIndicadorPeriodo(indicadorId, periodoId);
    const porClave = new Map(existentes.map((r) => [r.claveDesagregacion, r]));

    const filas: FilaCaptura[] = combinaciones.map((c) => {
      const clave = claveATexto(c.clave);
      const existente = porClave.get(clave);
      const esDetalleCompleto = totalDesagregacionesActivas > 0 && c.nivel === totalDesagregacionesActivas;
      const reciente = etiquetaMasReciente(c.etiquetas, indicador.desagregaciones);
      return {
        claveDesagregacion: clave,
        etiquetas: c.etiquetas.map((e) => ({
          listaId: e.listaId, codigo: e.codigo, descripcion: e.descripcion,
          listaNombre: nombresListas.get(e.listaId) ?? e.listaId
        })),
        etiquetaReciente: reciente && {
          listaId: reciente.listaId, descripcion: reciente.descripcion,
          listaNombre: nombresListas.get(reciente.listaId) ?? reciente.listaId
        },
        esGeneral: clave === 'GENERAL',
        esSubtotal: c.nivel > 0 && !esDetalleCompleto,
        esDetalleCompleto,
        valor: existente?.valor ?? null,
        observacion: existente?.observacion ?? null,
        actualizadoEn: existente?.actualizadoEn ?? null,
        estadoValidacion: existente?.estadoValidacion ?? 'Pendiente',
        comentarioValidacion: existente?.comentarioValidacion ?? null
      };
    });

    const reglasRecoleccion = await this.reglasRepo.listar('Recoleccion');
    const agregados = calcularAgregadosCaptura(
      filas.map((f) => ({ esGeneral: f.esGeneral, esDetalleCompleto: f.esDetalleCompleto, valor: f.valor }))
    );
    const advertencias = evaluarValidacionesCaptura(agregados, reglasRecoleccion);

    const definicion = await this.definicionPara(indicador);
    return {
      indicadorId,
      periodoId,
      periodoEtiqueta: this.etiquetaPeriodo(periodoId, definicion),
      fechaCorte: levantamiento?.fechaCorte ?? null,
      comentario: levantamiento?.comentario ?? null,
      desagregacionesDisponibles: indicador.desagregaciones.map((listaId) => ({
        listaId,
        nombre: nombresListas.get(listaId) ?? listaId,
        excluida: excluidas.includes(listaId)
      })),
      filas,
      advertencias
    };
  }

  /**
   * Persiste una celda (autoguardado). `valorCrudo` llega como texto de la
   * grilla o del portapapeles (pegado desde Excel) y se parsea con el tipo
   * Decimal del TypeRegistry. Retorna, además del valor persistido, las
   * advertencias de validación cruzada recalculadas sobre el levantamiento.
   */
  async guardarCelda(
    indicadorId: string,
    periodoId: string,
    claveDesagregacion: string,
    valorCrudo: string,
    observacion: string | null = null
  ): Promise<{ valor: number | null; advertencias: string[] }> {
    const indicadorActual = await this.indicadorConPermiso(indicadorId, 'registrar');
    if (indicadorActual.esCalculado) {
      throw new ValidacionError('Este indicador es calculado: su valor se obtiene automáticamente de la fórmula y no admite captura manual.');
    }
    const levantamientoActual = await this.resultados.obtenerLevantamiento(indicadorId, periodoId);
    if (!levantamientoActual?.fechaCorte) {
      throw new ValidacionError('Debe establecer la fecha de corte del período antes de capturar resultados.');
    }
    const parseado = this.tipos.obtener(TipoDato.Decimal).parse(valorCrudo);
    if (!parseado.ok) throw new ValidacionError(parseado.error ?? 'Valor inválido.');
    const valor = parseado.valor as number | null;

    await this.persistirValorCelda(indicadorId, periodoId, claveDesagregacion, valor, observacion);
    this.sincronizarExport();

    const captura = await this.obtenerCaptura(indicadorId, periodoId);
    return { valor, advertencias: captura.advertencias };
  }

  /**
   * Obtiene el resultado del período desde el origen configurado para el
   * indicador y escribe directamente las celdas de la grilla — incluidas
   * las de subtotal (nivel intermedio del cubo, ver ProductoCartesiano),
   * no solo General y detalle completo. Para cada desagregación mapeada de
   * cada fila, se determina si viene "enrollada" (subtotal) en esa fila: si
   * tiene un segmentador configurado (`columnaSegmentadorSubtotal`) y es
   * verdadero, o si no tiene segmentador y su columna viene en blanco. Una
   * desagregación NUNCA mapeada (o explícitamente omitida) se trata como
   * siempre enrollada — no hay de dónde sacar un valor concreto para ella,
   * así que solo bloquea escribir el detalle completo, no los subtotales
   * que no la involucran. Una fila cuyo valor no coincide con ningún
   * elemento de su lista (y no está enrollada) no puede determinarse: se
   * cuenta como error en vez de escribirse con una clave fantasma.
   */
  async obtenerResultadoAutomatico(indicadorId: string, periodoId: string): Promise<ResultadoObtencionAutomatica> {
    const indicador = await this.indicadorConPermiso(indicadorId, 'registrar');
    if (indicador.esCalculado) {
      throw new ValidacionError('Este indicador es calculado: su valor se obtiene de la fórmula, no de un origen automático.');
    }
    const automatizacion = await this.automatizaciones.obtenerPorIndicador(indicadorId);
    if (!automatizacion) {
      throw new ValidacionError('Este indicador no tiene configurada la obtención automática de resultados.');
    }
    const origen = await this.origenesAutomaticos.obtener(automatizacion.origenAutomaticoId);
    if (!origen) throw new ValidacionError('El origen automático configurado ya no existe.');
    if (!automatizacion.columnaValor) {
      throw new ValidacionError('Falta configurar la columna del valor en la automatización de este indicador.');
    }
    const levantamiento = await this.resultados.obtenerLevantamiento(indicadorId, periodoId);
    if (!levantamiento?.fechaCorte) {
      throw new ValidacionError('Debe establecer la fecha de corte del período antes de obtener resultados.');
    }

    const definicion = await this.definicionPara(indicador);
    const periodo = this.construirPeriodo(periodoId, definicion);
    const tokens = resolverParametrosGenerales(origen.parametrosGenerales, periodo);
    const valoresAtributos = await this.atributosRepo.obtenerValores('Indicador', indicadorId);
    for (const parametro of automatizacion.parametrosDinamicos) {
      const valor = valoresAtributos.find((v) => v.atributoId === parametro.atributoId);
      tokens.set(
        parametro.nombre,
        valor ? (valor.valorTexto ?? valor.valorNumero?.toString() ?? valor.valorFecha ?? (valor.valorBooleano != null ? String(valor.valorBooleano) : '')) : ''
      );
    }
    const scriptFinal = sustituirTokens(automatizacion.script, tokens);

    let resultado;
    try {
      resultado = await this.conector.ejecutar(origen, scriptFinal);
    } catch (error) {
      throw new ValidacionError(`No se pudo obtener el resultado del origen: ${(error as Error).message}`);
    }

    const listasCubiertas = indicador.desagregaciones.filter((listaId) =>
      automatizacion.mapeoColumnas.some((m) => m.listaId === listaId && m.columna) && !automatizacion.desagregacionesOmitidas.includes(listaId)
    );
    const desagregacionesSinMapear = indicador.desagregaciones.filter((listaId) => !listasCubiertas.includes(listaId));
    const mapeoPorLista = new Map(automatizacion.mapeoColumnas.map((m) => [m.listaId, m]));

    // El origen devuelve nombres legibles ("Masculino"), no los códigos internos de la
    // lista (autogenerados desde su prefijo, sin relación con el dato de origen) — se
    // resuelve cada valor crudo al código real del elemento antes de construir la clave
    // de desagregación, la misma que usa la grilla de captura manual. Un valor sin
    // coincidencia exacta con ningún nombre de elemento activo no puede resolverse a una
    // clave alcanzable: la fila se cuenta como error en vez de escribirse con una clave
    // fantasma que la grilla nunca mostraría.
    const elementosPorLista = new Map<string, ElementoLista[]>();
    for (const listaId of listasCubiertas) {
      elementosPorLista.set(listaId, await this.listas.listarElementos(listaId));
    }
    const codigoPorNombre = (listaId: string, nombre: string): string | undefined =>
      elementosPorLista.get(listaId)?.find((e) => e.nombre === nombre)?.codigo;
    const tipoBooleano = this.tipos.obtener(TipoDato.Boolean);
    const esVerdadero = (crudo: string | undefined): boolean => {
      const parseado = tipoBooleano.parse(crudo ?? '');
      return parseado.ok && parseado.valor === true;
    };

    let celdasActualizadas = 0;
    let filasConError = 0;
    for (const fila of resultado.filas) {
      // Por cada desagregación mapeada, se determina si esta fila la trae "enrollada"
      // (subtotal): con segmentador configurado, gana su valor; sin segmentador, un
      // valor en blanco en la columna mapeada ya se interpreta como enrollada — así
      // "todas en blanco" (la fila General) sigue funcionando exactamente como antes,
      // ahora generalizado a subtotales parciales de una sola desagregación.
      const pares: Array<readonly [string, string]> = [];
      let filaValida = true;
      for (const listaId of listasCubiertas) {
        const mapeo = mapeoPorLista.get(listaId)!;
        const enrollada = mapeo.columnaSegmentadorSubtotal
          ? esVerdadero(fila[mapeo.columnaSegmentadorSubtotal])
          : !fila[mapeo.columna];
        if (enrollada) continue;
        const codigo = codigoPorNombre(listaId, fila[mapeo.columna] ?? '');
        if (codigo == null) {
          filaValida = false;
          break;
        }
        pares.push([listaId, codigo]);
      }
      if (!filaValida) {
        filasConError += 1;
        continue;
      }
      const clave = claveATexto(pares.length === 0 ? CLAVE_GENERAL : crearClave(pares));
      const parseado = this.tipos.obtener(TipoDato.Decimal).parse(fila[automatizacion.columnaValor] ?? '');
      if (!parseado.ok) {
        filasConError += 1;
        continue;
      }
      await this.persistirValorCelda(indicadorId, periodoId, clave, parseado.valor as number | null, null);
      celdasActualizadas += 1;
    }

    this.sincronizarExport();
    return { celdasActualizadas, filasConError, desagregacionesSinMapear };
  }

  private construirPeriodo(periodoId: string, definicion?: DefinicionPeriodicidad): Periodo {
    const [anioTexto, periodicidad] = periodoId.split('-');
    const periodo = this.generadorPeriodos
      .periodosDelAnio(Number(anioTexto), periodicidad as Periodicidad, definicion)
      .find((p) => p.id === periodoId);
    if (!periodo) throw new EntidadNoEncontradaError('Periodo', periodoId);
    return periodo;
  }

  /** Guarda el valor vigente de una celda, versionando el anterior si existía. Compartido por captura manual y automática. */
  private async persistirValorCelda(
    indicadorId: string,
    periodoId: string,
    claveDesagregacion: string,
    valor: number | null,
    observacion: string | null
  ): Promise<void> {
    const existentes = await this.resultados.obtenerPorIndicadorPeriodo(indicadorId, periodoId);
    const anterior = existentes.find((r) => r.claveDesagregacion === claveDesagregacion) ?? null;
    const ahora = this.ctx.reloj.ahoraIso();

    if (anterior) {
      await this.registrarVersionAnterior(indicadorId, periodoId, claveDesagregacion, anterior.valor, anterior.observacion, anterior.actualizadoEn);
    }

    // Batch T: un resultado ya Validado/Rechazado que se vuelve a editar regresa a
    // Pendiente — un valor validado en pantalla siempre debe corresponder a lo último
    // capturado (decisión confirmada con el usuario, ver docstring de Resultado).
    const seEdito = anterior != null && (anterior.valor !== valor || (observacion != null && observacion !== anterior.observacion));
    const reiniciaValidacion = anterior != null && anterior.estadoValidacion !== 'Pendiente' && seEdito;

    await this.resultados.guardar({
      id: anterior?.id ?? this.ctx.ids.nuevoId(),
      indicadorId,
      periodoId,
      anio: Number(periodoId.slice(0, 4)),
      claveDesagregacion,
      valor,
      observacion: observacion ?? anterior?.observacion ?? null,
      estadoValidacion: reiniciaValidacion ? 'Pendiente' : (anterior?.estadoValidacion ?? 'Pendiente'),
      validadoPor: reiniciaValidacion ? null : (anterior?.validadoPor ?? null),
      validadoEn: reiniciaValidacion ? null : (anterior?.validadoEn ?? null),
      comentarioValidacion: reiniciaValidacion ? null : (anterior?.comentarioValidacion ?? null),
      creadoEn: anterior?.creadoEn ?? ahora,
      actualizadoEn: ahora
    });
    await this.auditar('Modificar', 'Resultado', `${indicadorId}:${periodoId}:${claveDesagregacion}`,
      'valor', anterior?.valor ?? null, valor);
  }

  /**
   * Marca un resultado como `Validado`/`Rechazado` (Batch T) — capa de
   * aprobación puramente informativa: no impide seguir capturando (ver
   * `persistirValorCelda`, que reinicia a `Pendiente` si el valor vuelve a
   * cambiar después). Exige el permiso `resultados.validar.*` (nunca lo
   * concede la regla del responsable directo, ver `puedeSobreIndicador`).
   */
  private async establecerValidacion(
    indicadorId: string,
    periodoId: string,
    claveDesagregacion: string,
    estado: 'Validado' | 'Rechazado',
    comentario: string | null
  ): Promise<void> {
    await this.indicadorConPermiso(indicadorId, 'validar');
    const existentes = await this.resultados.obtenerPorIndicadorPeriodo(indicadorId, periodoId);
    const actual = existentes.find((r) => r.claveDesagregacion === claveDesagregacion);
    if (!actual) throw new EntidadNoEncontradaError('Resultado', `${indicadorId}:${periodoId}:${claveDesagregacion}`);

    const guardado = {
      ...actual,
      estadoValidacion: estado,
      validadoPor: usuarioActual(),
      validadoEn: this.ctx.reloj.ahoraIso(),
      comentarioValidacion: comentario,
      actualizadoEn: this.ctx.reloj.ahoraIso()
    };
    await this.resultados.guardar(guardado);
    await this.auditar('Modificar', 'Resultado', `${indicadorId}:${periodoId}:${claveDesagregacion}`,
      'validacion', actual.estadoValidacion, estado);
  }

  validarResultado(indicadorId: string, periodoId: string, claveDesagregacion: string, comentario: string | null = null): Promise<void> {
    return this.establecerValidacion(indicadorId, periodoId, claveDesagregacion, 'Validado', comentario);
  }

  rechazarResultado(indicadorId: string, periodoId: string, claveDesagregacion: string, comentario: string | null = null): Promise<void> {
    return this.establecerValidacion(indicadorId, periodoId, claveDesagregacion, 'Rechazado', comentario);
  }

  /** Historial de versiones previas de una celda, más reciente primero. */
  async historialCelda(indicadorId: string, periodoId: string, claveDesagregacion: string): Promise<ResultadoHistorial[]> {
    await this.indicadorConPermiso(indicadorId, 'ver');
    return this.resultados.obtenerHistorial(indicadorId, periodoId, claveDesagregacion);
  }

  /**
   * Restaura una versión previa de una celda: la vuelve a escribir como el
   * valor vigente (registrando, a su vez, el estado que reemplaza como una
   * nueva versión del historial — el historial nunca se reescribe).
   */
  async restaurarVersion(
    indicadorId: string,
    periodoId: string,
    claveDesagregacion: string,
    version: number
  ): Promise<{ valor: number | null; advertencias: string[] }> {
    await this.indicadorConPermiso(indicadorId, 'registrar');
    const historial = await this.resultados.obtenerHistorial(indicadorId, periodoId, claveDesagregacion);
    const objetivo = historial.find((h) => h.version === version);
    if (!objetivo) throw new EntidadNoEncontradaError('ResultadoHistorial', `${indicadorId}:${periodoId}:${claveDesagregacion}:v${version}`);

    const existentes = await this.resultados.obtenerPorIndicadorPeriodo(indicadorId, periodoId);
    const anterior = existentes.find((r) => r.claveDesagregacion === claveDesagregacion) ?? null;
    await this.aplicarRestauracion(indicadorId, periodoId, claveDesagregacion, anterior, objetivo.valor, objetivo.observacion);
    this.sincronizarExport();

    const captura = await this.obtenerCaptura(indicadorId, periodoId);
    return { valor: objetivo.valor, advertencias: captura.advertencias };
  }

  /**
   * Restaura TODAS las desagregaciones del período al estado vigente en un
   * punto en el tiempo (Batch U10): para cada celda con al menos una versión
   * (el valor actual o alguna del historial) en o antes de `timestamp`, se
   * aplica la misma restauración que `restaurarVersion` — una escritura y una
   * fila de auditoría por celda efectivamente cambiada. Alcance confirmado
   * con el usuario: solo el período indicado, no todo el histórico del
   * indicador. Las celdas que ya coinciden con ese estado, o que todavía no
   * existían en ese momento, se dejan intactas (no generan escritura).
   */
  async restaurarPeriodo(
    indicadorId: string,
    periodoId: string,
    timestamp: string
  ): Promise<{ restauradas: number; advertencias: string[] }> {
    const indicador = await this.indicadorConPermiso(indicadorId, 'registrar');
    if (indicador.esCalculado) {
      throw new ValidacionError('Este indicador es calculado: su valor se obtiene de la fórmula y no admite restauración manual.');
    }

    const captura = await this.obtenerCaptura(indicadorId, periodoId);
    const existentes = await this.resultados.obtenerPorIndicadorPeriodo(indicadorId, periodoId);
    const actualesPorClave = new Map(existentes.map((r) => [r.claveDesagregacion, r]));

    let restauradas = 0;
    for (const fila of captura.filas) {
      const clave = fila.claveDesagregacion;
      const actual = actualesPorClave.get(clave) ?? null;
      const historial = await this.resultados.obtenerHistorial(indicadorId, periodoId, clave);

      // "Vigente en timestamp" = la versión (actual o histórica) más reciente
      // cuya fecha no sea posterior a `timestamp` — comparación lexicográfica
      // válida porque ahoraIso() siempre es un ISO-8601 completo (RelojSistema).
      const candidatos = [
        ...(actual ? [{ valor: actual.valor, observacion: actual.observacion, actualizadoEn: actual.actualizadoEn }] : []),
        ...historial.map((h) => ({ valor: h.valor, observacion: h.observacion, actualizadoEn: h.actualizadoEn }))
      ].filter((c) => c.actualizadoEn <= timestamp);
      if (candidatos.length === 0) continue; // esta celda todavía no existía en ese momento

      const objetivo = candidatos.reduce((a, b) => (b.actualizadoEn > a.actualizadoEn ? b : a));
      if (actual && actual.valor === objetivo.valor && actual.observacion === objetivo.observacion) continue; // ya coincide

      await this.aplicarRestauracion(indicadorId, periodoId, clave, actual, objetivo.valor, objetivo.observacion);
      restauradas++;
    }

    if (restauradas > 0) this.sincronizarExport();
    const capturaFinal = await this.obtenerCaptura(indicadorId, periodoId);
    return { restauradas, advertencias: capturaFinal.advertencias };
  }

  /** Escribe `valorObjetivo` como el valor vigente de una celda, archivando el estado que reemplaza en el historial. Compartido por `restaurarVersion` y `restaurarPeriodo`. */
  private async aplicarRestauracion(
    indicadorId: string,
    periodoId: string,
    claveDesagregacion: string,
    anterior: Resultado | null,
    valorObjetivo: number | null,
    observacionObjetivo: string | null
  ): Promise<void> {
    if (anterior) {
      await this.registrarVersionAnterior(indicadorId, periodoId, claveDesagregacion, anterior.valor, anterior.observacion, anterior.actualizadoEn);
    }

    const ahora = this.ctx.reloj.ahoraIso();
    // Restaurar una celda es, a efectos de validación, otra edición del valor
    // vigente — misma regla de "vuelve a Pendiente" que persistirValorCelda.
    const reiniciaValidacion = anterior != null && anterior.estadoValidacion !== 'Pendiente';
    await this.resultados.guardar({
      id: anterior?.id ?? this.ctx.ids.nuevoId(),
      indicadorId,
      periodoId,
      anio: Number(periodoId.slice(0, 4)),
      claveDesagregacion,
      valor: valorObjetivo,
      observacion: observacionObjetivo,
      estadoValidacion: reiniciaValidacion ? 'Pendiente' : (anterior?.estadoValidacion ?? 'Pendiente'),
      validadoPor: reiniciaValidacion ? null : (anterior?.validadoPor ?? null),
      validadoEn: reiniciaValidacion ? null : (anterior?.validadoEn ?? null),
      comentarioValidacion: reiniciaValidacion ? null : (anterior?.comentarioValidacion ?? null),
      creadoEn: anterior?.creadoEn ?? ahora,
      actualizadoEn: ahora
    });
    await this.auditar('Restaurar', 'Resultado', `${indicadorId}:${periodoId}:${claveDesagregacion}`,
      'valor', anterior?.valor ?? null, valorObjetivo);
  }

  private async registrarVersionAnterior(
    indicadorId: string,
    periodoId: string,
    claveDesagregacion: string,
    valor: number | null,
    observacion: string | null,
    actualizadoEn: string
  ): Promise<void> {
    const historialExistente = await this.resultados.obtenerHistorial(indicadorId, periodoId, claveDesagregacion);
    await this.resultados.registrarVersion({
      id: this.ctx.ids.nuevoId(),
      indicadorId,
      periodoId,
      claveDesagregacion,
      version: historialExistente.length + 1,
      valor,
      observacion,
      usuario: usuarioActual(),
      actualizadoEn
    });
  }

  /** La fecha de corte es única por indicador+período y obligatoria para completar. */
  async establecerFechaCorte(indicadorId: string, periodoId: string, fechaCorte: string | null): Promise<void> {
    await this.indicadorConPermiso(indicadorId, 'registrar');
    const anterior = await this.resultados.obtenerLevantamiento(indicadorId, periodoId);
    await this.guardarLevantamiento(indicadorId, periodoId, {
      fechaCorte,
      desagregacionesExcluidas: anterior?.desagregacionesExcluidas ?? [],
      comentario: anterior?.comentario ?? null
    }, anterior);
    await this.auditar('Modificar', 'Levantamiento', `${indicadorId}:${periodoId}`, 'fechaCorte',
      anterior?.fechaCorte ?? null, fechaCorte);
    this.sincronizarExport();
  }

  /** Comentario opcional del levantamiento (a nivel indicador+período, no por celda). */
  async establecerComentario(indicadorId: string, periodoId: string, comentario: string | null): Promise<void> {
    await this.indicadorConPermiso(indicadorId, 'registrar');
    const anterior = await this.resultados.obtenerLevantamiento(indicadorId, periodoId);
    await this.guardarLevantamiento(indicadorId, periodoId, {
      fechaCorte: anterior?.fechaCorte ?? null,
      desagregacionesExcluidas: anterior?.desagregacionesExcluidas ?? [],
      comentario
    }, anterior);
    await this.auditar('Modificar', 'Levantamiento', `${indicadorId}:${periodoId}`, 'comentario',
      anterior?.comentario ?? null, comentario);
  }

  /** Exclusión temporal de una desagregación: nunca modifica el indicador. */
  async alternarExclusion(indicadorId: string, periodoId: string, listaId: string, excluir: boolean): Promise<void> {
    await this.indicadorConPermiso(indicadorId, 'registrar');
    const anterior = await this.resultados.obtenerLevantamiento(indicadorId, periodoId);
    const actuales = new Set(anterior?.desagregacionesExcluidas ?? []);
    if (excluir) actuales.add(listaId);
    else actuales.delete(listaId);
    await this.guardarLevantamiento(indicadorId, periodoId, {
      fechaCorte: anterior?.fechaCorte ?? null,
      desagregacionesExcluidas: [...actuales],
      comentario: anterior?.comentario ?? null
    }, anterior);
    await this.auditar('Modificar', 'Levantamiento', `${indicadorId}:${periodoId}`, 'exclusiones',
      JSON.stringify(anterior?.desagregacionesExcluidas ?? []), JSON.stringify([...actuales]));
  }

  private async guardarLevantamiento(
    indicadorId: string,
    periodoId: string,
    datos: Pick<Levantamiento, 'fechaCorte' | 'desagregacionesExcluidas' | 'comentario'>,
    anterior: Levantamiento | null
  ): Promise<void> {
    const ahora = this.ctx.reloj.ahoraIso();
    await this.resultados.guardarLevantamiento({
      id: anterior?.id ?? this.ctx.ids.nuevoId(),
      indicadorId,
      periodoId,
      anio: Number(periodoId.slice(0, 4)),
      fechaCorte: datos.fechaCorte,
      desagregacionesExcluidas: datos.desagregacionesExcluidas,
      comentario: datos.comentario,
      creadoEn: anterior?.creadoEn ?? ahora,
      actualizadoEn: ahora
    });
  }

  /**
   * Evalúa la fórmula de un indicador calculado para un período, resolviendo
   * cada código referenciado al valor GENERAL de ese indicador en el mismo
   * período. Solo opera a nivel GENERAL (sin desagregar).
   */
  private async calcularValorIndicador(formula: string, periodoId: string): Promise<number | null> {
    let codigos: string[];
    try {
      codigos = this.formulas.codigosReferenciados(formula);
    } catch {
      return null;
    }
    const valores = new Map<string, number | null>();
    for (const codigo of codigos) {
      const refIndicador = await this.indicadores.buscarPorCodigo(codigo);
      if (!refIndicador) {
        valores.set(codigo, null);
        continue;
      }
      const resultados = await this.resultados.obtenerPorIndicadorPeriodo(refIndicador.id, periodoId);
      const general = resultados.find((r) => r.claveDesagregacion === 'GENERAL');
      valores.set(codigo, general?.valor ?? null);
    }
    try {
      return this.formulas.evaluar(formula, valores);
    } catch {
      return null;
    }
  }

  private etiquetaPeriodo(periodoId: string, definicion?: DefinicionPeriodicidad): string {
    const [anio, periodicidad, numero] = periodoId.split('-');
    try {
      return (
        this.generadorPeriodos.periodosDelAnio(Number(anio), periodicidad as Periodicidad, definicion)[Number(numero) - 1]
          ?.etiqueta ?? periodoId
      );
    } catch {
      return periodoId;
    }
  }
}
