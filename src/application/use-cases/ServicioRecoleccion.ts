import {
  EntidadNoEncontradaError, EvaluadorFormulas, GeneradorPeriodos, Periodicidad, ProductoCartesiano, TipoDato,
  ValidacionError, calcularAgregadosCaptura, claveATexto, evaluarValidacionesCaptura
} from '@domain/index';
import type {
  DefinicionPeriodicidad, ElementoLista, Indicador, Levantamiento, Periodo, ResultadoHistorial, TypeRegistry
} from '@domain/index';
import type {
  IConfiguracionRepository, IDefinicionPeriodicidadRepository, IIndicadorRepository,
  IListaRepository, IReglaRepository, IResultadoRepository
} from '@application/ports/index';
import { ServicioBase, USUARIO_LOCAL } from './base';
import type { ContextoAplicacion } from './base';

export interface FilaCaptura {
  claveDesagregacion: string;
  etiquetas: Array<{ listaId: string; listaNombre: string; codigo: string; descripcion: string }>;
  esGeneral: boolean;
  valor: number | null;
  observacion: string | null;
  actualizadoEn: string | null;
}

export interface DatosCaptura {
  indicadorId: string;
  periodoId: string;
  periodoEtiqueta: string;
  fechaCorte: string | null;
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
    private readonly tipos: TypeRegistry
  ) {
    super(ctx);
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
    const indicador = await this.indicadores.obtener(indicadorId);
    if (!indicador) throw new EntidadNoEncontradaError('Indicador', indicadorId);
    const config = await this.configuracion.obtener();
    const definicion = await this.definicionPara(indicador);
    return this.generadorPeriodos.periodosDisponibles(config.anioInicial, indicador.periodicidad, this.ctx.reloj.hoyIso(), definicion);
  }

  async obtenerCaptura(indicadorId: string, periodoId: string): Promise<DatosCaptura> {
    const indicador = await this.indicadores.obtener(indicadorId);
    if (!indicador) throw new EntidadNoEncontradaError('Indicador', indicadorId);

    if (indicador.esCalculado && indicador.formula) {
      const valor = await this.calcularValorIndicador(indicador.formula, periodoId);
      const definicion = await this.definicionPara(indicador);
      return {
        indicadorId,
        periodoId,
        periodoEtiqueta: this.etiquetaPeriodo(periodoId, definicion),
        fechaCorte: null,
        desagregacionesDisponibles: [],
        filas: [{
          claveDesagregacion: 'GENERAL',
          etiquetas: [],
          esGeneral: true,
          valor,
          observacion: null,
          actualizadoEn: null
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

    const combinaciones = this.productoCartesiano.generar(indicador.desagregaciones, elementosPorLista, excluidas);
    const existentes = await this.resultados.obtenerPorIndicadorPeriodo(indicadorId, periodoId);
    const porClave = new Map(existentes.map((r) => [r.claveDesagregacion, r]));

    const filas: FilaCaptura[] = combinaciones.map((c) => {
      const clave = claveATexto(c.clave);
      const existente = porClave.get(clave);
      return {
        claveDesagregacion: clave,
        etiquetas: c.etiquetas.map((e) => ({ ...e, listaNombre: nombresListas.get(e.listaId) ?? e.listaId })),
        esGeneral: clave === 'GENERAL',
        valor: existente?.valor ?? null,
        observacion: existente?.observacion ?? null,
        actualizadoEn: existente?.actualizadoEn ?? null
      };
    });

    const reglasRecoleccion = await this.reglasRepo.listar('Recoleccion');
    const agregados = calcularAgregadosCaptura(filas.map((f) => ({ esGeneral: f.esGeneral, valor: f.valor })));
    const advertencias = evaluarValidacionesCaptura(agregados, reglasRecoleccion);

    const definicion = await this.definicionPara(indicador);
    return {
      indicadorId,
      periodoId,
      periodoEtiqueta: this.etiquetaPeriodo(periodoId, definicion),
      fechaCorte: levantamiento?.fechaCorte ?? null,
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
    const indicadorActual = await this.indicadores.obtener(indicadorId);
    if (indicadorActual?.esCalculado) {
      throw new ValidacionError('Este indicador es calculado: su valor se obtiene automáticamente de la fórmula y no admite captura manual.');
    }
    const parseado = this.tipos.obtener(TipoDato.Decimal).parse(valorCrudo);
    if (!parseado.ok) throw new ValidacionError(parseado.error ?? 'Valor inválido.');
    const valor = parseado.valor as number | null;

    const existentes = await this.resultados.obtenerPorIndicadorPeriodo(indicadorId, periodoId);
    const anterior = existentes.find((r) => r.claveDesagregacion === claveDesagregacion) ?? null;
    const ahora = this.ctx.reloj.ahoraIso();

    if (anterior) {
      await this.registrarVersionAnterior(indicadorId, periodoId, claveDesagregacion, anterior.valor, anterior.observacion, anterior.actualizadoEn);
    }

    await this.resultados.guardar({
      id: anterior?.id ?? this.ctx.ids.nuevoId(),
      indicadorId,
      periodoId,
      anio: Number(periodoId.slice(0, 4)),
      claveDesagregacion,
      valor,
      observacion: observacion ?? anterior?.observacion ?? null,
      creadoEn: anterior?.creadoEn ?? ahora,
      actualizadoEn: ahora
    });
    await this.auditar('Modificar', 'Resultado', `${indicadorId}:${periodoId}:${claveDesagregacion}`,
      'valor', anterior?.valor ?? null, valor);
    this.sincronizarExport();

    const captura = await this.obtenerCaptura(indicadorId, periodoId);
    return { valor, advertencias: captura.advertencias };
  }

  /** Historial de versiones previas de una celda, más reciente primero. */
  async historialCelda(indicadorId: string, periodoId: string, claveDesagregacion: string): Promise<ResultadoHistorial[]> {
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
    const historial = await this.resultados.obtenerHistorial(indicadorId, periodoId, claveDesagregacion);
    const objetivo = historial.find((h) => h.version === version);
    if (!objetivo) throw new EntidadNoEncontradaError('ResultadoHistorial', `${indicadorId}:${periodoId}:${claveDesagregacion}:v${version}`);

    const existentes = await this.resultados.obtenerPorIndicadorPeriodo(indicadorId, periodoId);
    const anterior = existentes.find((r) => r.claveDesagregacion === claveDesagregacion) ?? null;
    if (anterior) {
      await this.registrarVersionAnterior(indicadorId, periodoId, claveDesagregacion, anterior.valor, anterior.observacion, anterior.actualizadoEn);
    }

    const ahora = this.ctx.reloj.ahoraIso();
    await this.resultados.guardar({
      id: anterior?.id ?? this.ctx.ids.nuevoId(),
      indicadorId,
      periodoId,
      anio: Number(periodoId.slice(0, 4)),
      claveDesagregacion,
      valor: objetivo.valor,
      observacion: objetivo.observacion,
      creadoEn: anterior?.creadoEn ?? ahora,
      actualizadoEn: ahora
    });
    await this.auditar('Restaurar', 'Resultado', `${indicadorId}:${periodoId}:${claveDesagregacion}`,
      'valor', anterior?.valor ?? null, objetivo.valor);
    this.sincronizarExport();

    const captura = await this.obtenerCaptura(indicadorId, periodoId);
    return { valor: objetivo.valor, advertencias: captura.advertencias };
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
      usuario: USUARIO_LOCAL,
      actualizadoEn
    });
  }

  /** La fecha de corte es única por indicador+período y obligatoria para completar. */
  async establecerFechaCorte(indicadorId: string, periodoId: string, fechaCorte: string | null): Promise<void> {
    const anterior = await this.resultados.obtenerLevantamiento(indicadorId, periodoId);
    await this.guardarLevantamiento(indicadorId, periodoId, {
      fechaCorte,
      desagregacionesExcluidas: anterior?.desagregacionesExcluidas ?? []
    }, anterior);
    await this.auditar('Modificar', 'Levantamiento', `${indicadorId}:${periodoId}`, 'fechaCorte',
      anterior?.fechaCorte ?? null, fechaCorte);
    this.sincronizarExport();
  }

  /** Exclusión temporal de una desagregación: nunca modifica el indicador. */
  async alternarExclusion(indicadorId: string, periodoId: string, listaId: string, excluir: boolean): Promise<void> {
    const anterior = await this.resultados.obtenerLevantamiento(indicadorId, periodoId);
    const actuales = new Set(anterior?.desagregacionesExcluidas ?? []);
    if (excluir) actuales.add(listaId);
    else actuales.delete(listaId);
    await this.guardarLevantamiento(indicadorId, periodoId, {
      fechaCorte: anterior?.fechaCorte ?? null,
      desagregacionesExcluidas: [...actuales]
    }, anterior);
    await this.auditar('Modificar', 'Levantamiento', `${indicadorId}:${periodoId}`, 'exclusiones',
      JSON.stringify(anterior?.desagregacionesExcluidas ?? []), JSON.stringify([...actuales]));
  }

  private async guardarLevantamiento(
    indicadorId: string,
    periodoId: string,
    datos: Pick<Levantamiento, 'fechaCorte' | 'desagregacionesExcluidas'>,
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
