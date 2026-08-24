import {
  CalculadoraEstados, EvaluadorFormulas, GeneradorPeriodos, Periodicidad, ProductoCartesiano, equipoEfectivo,
  metaVigenteParaPeriodo, puedeVerIndicador
} from '@domain/index';
import type {
  Atributo, Categoria, DeadlineRuleRegistry, DefinicionPeriodicidad, ElementoLista, Equipo, EstadoPeriodo,
  EstadoSeguimiento, Indicador, Meta
} from '@domain/index';
import type {
  IAtributoRepository, ICatalogoRepository, IConfiguracionRepository, IDefinicionPeriodicidadRepository,
  IIndicadorRepository, IListaRepository, IMetaRepository, IResultadoRepository, IUsuarioRepository
} from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';
import { permisosActuales } from './contextoUsuario';

/** Valor de un atributo dinámico marcado como filtrable, resuelto a texto legible. */
export interface AtributoFiltro {
  atributoId: string;
  nombre: string;
  valor: string | null;
}

export interface FilaTablero {
  indicadorId: string;
  codigo: string;
  nombre: string;
  estado: EstadoSeguimiento;
  periodicidad: Periodicidad;
  periodoPendiente: string | null;
  fechaLimite: string | null;
  fechaCorte: string | null;
  ultimaActualizacion: string | null;
  responsableId: string | null;
  responsable: string | null;
  categoriaId: string | null;
  categoria: string | null;
  /** Equipo EFECTIVO (directo si está seteado, si no indirecto vía el responsable) — ver `equipoEfectivo`. */
  equipoId: string | null;
  equipo: string | null;
  totalPeriodos: number;
  periodosCompletos: number;
  atributosFiltro: AtributoFiltro[];
}

export interface DetalleSeguimiento {
  indicadorId: string;
  nombre: string;
  estados: EstadoPeriodo[];
}

export interface PuntoHistorico {
  periodoId: string;
  etiqueta: string;
  fechaInicio: string;
  valor: number | null;
  /** Meta configurada vigente para este período específico (Meta.valor), de existir — ver `metaVigenteParaPeriodo`. `null` si no hay ninguna. */
  metaPeriodo: number | null;
  cumplimientoPct: number | null;
}

export interface FilaHistorico {
  indicadorId: string;
  nombre: string;
  lineaBase: number | null;
  metaGlobal: number | null;
  unidadMedida: string | null;
  categoriaId: string | null;
  categoria: string | null;
  /** Equipo EFECTIVO (directo si está seteado, si no indirecto vía el responsable) — ver `equipoEfectivo`. */
  equipoId: string | null;
  equipo: string | null;
  puntos: PuntoHistorico[];
}

/**
 * Tablero de seguimiento: calcula dinámicamente el estado de cada
 * indicador combinando fecha actual, regla de fecha límite, periodicidad,
 * períodos registrados y fecha de corte. No usa banderas persistidas.
 */
export class ServicioSeguimiento extends ServicioBase {
  private readonly generadorPeriodos = new GeneradorPeriodos();
  private readonly productoCartesiano = new ProductoCartesiano();
  private readonly formulas = new EvaluadorFormulas();
  private readonly calculadora: CalculadoraEstados;

  constructor(
    ctx: ContextoAplicacion,
    private readonly indicadores: IIndicadorRepository,
    private readonly listas: IListaRepository,
    private readonly resultados: IResultadoRepository,
    private readonly configuracion: IConfiguracionRepository,
    private readonly periodicidadesRepo: IDefinicionPeriodicidadRepository,
    private readonly usuariosRepo: IUsuarioRepository,
    private readonly categoriasRepo: ICatalogoRepository<Categoria>,
    private readonly equiposRepo: ICatalogoRepository<Equipo>,
    private readonly atributosRepo: IAtributoRepository,
    reglasFechaLimite: DeadlineRuleRegistry,
    private readonly metasRepo: IMetaRepository
  ) {
    super(ctx);
    this.calculadora = new CalculadoraEstados(reglasFechaLimite);
  }

  /** Atributos dinámicos de Indicador marcados como filtrables (activos). */
  private async atributosFiltrables(): Promise<Atributo[]> {
    return (await this.atributosRepo.listar('Indicador')).filter((a) => a.filtrable && a.activo);
  }

  /** Resuelve el valor legible de los atributos filtrables de un indicador (codigo -> nombre para listas). */
  private async valoresFiltroPara(
    indicadorId: string,
    atributos: Atributo[],
    elementosPorLista: Map<string, ElementoLista[]>
  ): Promise<AtributoFiltro[]> {
    if (atributos.length === 0) return [];
    const valores = await this.atributosRepo.obtenerValores('Indicador', indicadorId);
    const porAtributo = new Map(valores.map((v) => [v.atributoId, v]));
    return atributos.map((a) => {
      const v = porAtributo.get(a.id);
      let valor: string | null = null;
      if (v) {
        if (a.listaId && v.valorTexto) {
          const elementos = elementosPorLista.get(a.listaId) ?? [];
          valor = elementos.find((e) => e.codigo === v.valorTexto)?.nombre ?? v.valorTexto;
        } else {
          valor = v.valorTexto ?? (v.valorNumero != null ? String(v.valorNumero)
            : (v.valorFecha ?? (v.valorBooleano != null ? (v.valorBooleano ? 'Sí' : 'No') : null)));
        }
      }
      return { atributoId: a.id, nombre: a.nombre, valor };
    });
  }

  private async definicionPara(
    indicador: Indicador,
    definiciones: Map<string, DefinicionPeriodicidad>
  ): Promise<DefinicionPeriodicidad | undefined> {
    if (indicador.periodicidad !== Periodicidad.Personalizada || !indicador.periodicidadPersonalizadaId) {
      return undefined;
    }
    return definiciones.get(indicador.periodicidadPersonalizadaId);
  }

  /**
   * Resuelve la clasificación (categoría + equipo EFECTIVO) de un
   * indicador a su forma legible {id, nombre} — factorizado (U5b) porque
   * `tablero()` e `historico()` necesitan exactamente el mismo cálculo, y
   * el segundo lo usaba solo parcialmente hasta ahora (Histórico no traía
   * categoría/equipo en absoluto, así que su vista no podía agruparse
   * jerárquicamente como ya hace Estado).
   */
  private clasificacionDe(
    indicador: Indicador,
    nombreCategoria: ReadonlyMap<string, string>,
    nombreEquipo: ReadonlyMap<string, string>,
    usuariosPorId: ReadonlyMap<string, { equipoId: string | null }>
  ): Pick<FilaTablero, 'categoriaId' | 'categoria' | 'equipoId' | 'equipo'> {
    const equipoIdEfectivo = equipoEfectivo(indicador, usuariosPorId);
    return {
      categoriaId: indicador.categoria,
      categoria: indicador.categoria == null ? null : (nombreCategoria.get(indicador.categoria) ?? indicador.categoria),
      equipoId: equipoIdEfectivo,
      equipo: equipoIdEfectivo == null ? null : (nombreEquipo.get(equipoIdEfectivo) ?? equipoIdEfectivo)
    };
  }

  async tablero(): Promise<FilaTablero[]> {
    const [config, indicadores, resumen, levantamientos, definicionesLista, usuarios, categorias, equipos, atributosFiltrables] =
      await Promise.all([
        this.configuracion.obtener(),
        this.indicadores.listar(),
        this.resultados.resumenGlobal(),
        this.resultados.listarLevantamientos(),
        this.periodicidadesRepo.listar(),
        this.usuariosRepo.listar(),
        this.categoriasRepo.listar(),
        this.equiposRepo.listar(),
        this.atributosFiltrables()
      ]);
    const definiciones = new Map(definicionesLista.map((d) => [d.id, d]));
    const nombreResponsable = new Map(usuarios.map((u) => [u.id, u.nombreCompleto]));
    const nombreCategoria = new Map(categorias.map((c) => [c.id, c.nombre]));
    const nombreEquipo = new Map(equipos.map((e) => [e.id, e.nombre]));
    const usuariosPorId = new Map(usuarios.map((u) => [u.id, { equipoId: u.equipoId }]));
    const elementosPorLista = new Map<string, ElementoLista[]>();
    for (const listaId of new Set(atributosFiltrables.map((a) => a.listaId).filter((id): id is string => id != null))) {
      elementosPorLista.set(listaId, await this.listas.listarElementos(listaId));
    }
    const hoy = this.ctx.reloj.hoyIso();
    const filas: FilaTablero[] = [];

    // Batch T: un indicador que el usuario no puede ver ni siquiera aparece en el
    // tablero (en vez de un error) — ver `puedeVerIndicador`.
    const permisos = permisosActuales();
    const visibles = indicadores.filter((i) =>
      puedeVerIndicador(permisos, { equipoEfectivoId: equipoEfectivo(i, usuariosPorId), responsable: i.responsable })
    );

    for (const indicador of visibles) {
      const totalCombinaciones = await this.totalCombinaciones(indicador.desagregaciones);
      const definicion = await this.definicionPara(indicador, definiciones);
      const periodos = this.generadorPeriodos.periodosCerrados(config.anioInicial, indicador.periodicidad, hoy, definicion);
      const estados: EstadoPeriodo[] = periodos.map((periodo) => {
        const r = resumen.find((x) => x.indicadorId === indicador.id && x.periodoId === periodo.id);
        const lev = levantamientos.find((x) => x.indicadorId === indicador.id && x.periodoId === periodo.id);
        // La exclusión temporal reduce el total exigido para ese período.
        const total = lev && lev.desagregacionesExcluidas.length > 0
          ? totalCombinaciones.conExclusiones(lev.desagregacionesExcluidas)
          : totalCombinaciones.total;
        return this.calculadora.calcularEstadoPeriodo(
          {
            periodo,
            fechaCorte: lev?.fechaCorte ?? null,
            totalCombinaciones: total,
            combinacionesConValor: r?.combinacionesConValor ?? 0,
            ultimaActualizacion: r?.ultimaActualizacion ?? null
          },
          config.reglaFechaLimite,
          hoy,
          indicador.estado === 'Activo'
        );
      });

      const pendiente = this.calculadora.periodoPendiente(estados);
      const ultimas = resumen
        .filter((x) => x.indicadorId === indicador.id)
        .map((x) => x.ultimaActualizacion)
        .filter((x): x is string => x != null)
        .sort();
      filas.push({
        indicadorId: indicador.id,
        codigo: indicador.codigo,
        nombre: indicador.nombre,
        estado: indicador.estado !== 'Activo' ? 'NoAplica' : (pendiente?.estado ?? (estados.length > 0 ? 'Completo' : 'NoAplica')),
        periodicidad: indicador.periodicidad,
        periodoPendiente: pendiente?.periodo.etiqueta ?? null,
        fechaLimite: pendiente?.fechaLimite ?? null,
        fechaCorte: pendiente?.fechaCorte ?? null,
        ultimaActualizacion: ultimas[ultimas.length - 1] ?? null,
        responsableId: indicador.responsable,
        responsable: indicador.responsable == null ? null : (nombreResponsable.get(indicador.responsable) ?? indicador.responsable),
        ...this.clasificacionDe(indicador, nombreCategoria, nombreEquipo, usuariosPorId),
        totalPeriodos: estados.length,
        periodosCompletos: estados.filter((e) => e.estado === 'Completo').length,
        atributosFiltro: await this.valoresFiltroPara(indicador.id, atributosFiltrables, elementosPorLista)
      });
    }
    return filas;
  }

  /** Detalle por período de un indicador (panel lateral del tablero). */
  async detalle(indicadorId: string): Promise<DetalleSeguimiento | null> {
    const indicador = await this.indicadores.obtener(indicadorId);
    if (!indicador) return null;
    const responsable = indicador.responsable ? await this.usuariosRepo.obtener(indicador.responsable) : null;
    const usuariosPorId = new Map(responsable ? [[responsable.id, { equipoId: responsable.equipoId }] as const] : []);
    if (!puedeVerIndicador(permisosActuales(), { equipoEfectivoId: equipoEfectivo(indicador, usuariosPorId), responsable: indicador.responsable })) {
      return null;
    }
    const config = await this.configuracion.obtener();
    const hoy = this.ctx.reloj.hoyIso();
    const [resumen, levantamientos, definicionesLista] = await Promise.all([
      this.resultados.resumenPorIndicador(indicadorId),
      this.resultados.listarLevantamientos(indicadorId),
      this.periodicidadesRepo.listar()
    ]);
    const definiciones = new Map(definicionesLista.map((d) => [d.id, d]));
    const definicion = await this.definicionPara(indicador, definiciones);
    const totalCombinaciones = await this.totalCombinaciones(indicador.desagregaciones);
    const periodos = this.generadorPeriodos.periodosCerrados(config.anioInicial, indicador.periodicidad, hoy, definicion);

    const estados = periodos.map((periodo) => {
      const r = resumen.find((x) => x.periodoId === periodo.id);
      const lev = levantamientos.find((x) => x.periodoId === periodo.id);
      const total = lev && lev.desagregacionesExcluidas.length > 0
        ? totalCombinaciones.conExclusiones(lev.desagregacionesExcluidas)
        : totalCombinaciones.total;
      return this.calculadora.calcularEstadoPeriodo(
        {
          periodo,
          fechaCorte: lev?.fechaCorte ?? null,
          totalCombinaciones: total,
          combinacionesConValor: r?.combinacionesConValor ?? 0,
          ultimaActualizacion: r?.ultimaActualizacion ?? null
        },
        config.reglaFechaLimite,
        hoy,
        indicador.estado === 'Activo'
      );
    });
    return { indicadorId, nombre: indicador.nombre, estados };
  }

  /**
   * Serie histórica por indicador (períodos cerrados con su valor GENERAL y
   * cumplimiento respecto a la meta), para la vista pivotada de Seguimiento.
   * Los indicadores calculados evalúan su fórmula por período en vez de leer
   * `resultados` (no tienen filas propias, ver ExportAnaliticoService).
   */
  async historico(): Promise<FilaHistorico[]> {
    const [config, indicadores, usuarios, categorias, equipos] = await Promise.all([
      this.configuracion.obtener(), this.indicadores.listar(), this.usuariosRepo.listar(),
      this.categoriasRepo.listar(), this.equiposRepo.listar()
    ]);
    const definicionesLista = await this.periodicidadesRepo.listar();
    const definiciones = new Map(definicionesLista.map((d) => [d.id, d]));
    const hoy = this.ctx.reloj.hoyIso();
    const filas: FilaHistorico[] = [];

    const nombreCategoria = new Map(categorias.map((c) => [c.id, c.nombre]));
    const nombreEquipo = new Map(equipos.map((e) => [e.id, e.nombre]));
    const usuariosPorId = new Map(usuarios.map((u) => [u.id, { equipoId: u.equipoId }]));
    const permisos = permisosActuales();
    const visibles = indicadores.filter((i) =>
      puedeVerIndicador(permisos, { equipoEfectivoId: equipoEfectivo(i, usuariosPorId), responsable: i.responsable })
    );

    for (const indicador of visibles) {
      const definicion = await this.definicionPara(indicador, definiciones);
      const periodos = this.generadorPeriodos.periodosCerrados(config.anioInicial, indicador.periodicidad, hoy, definicion);
      const valoresPorPeriodo = new Map<string, number | null>();
      if (indicador.esCalculado && indicador.formula) {
        for (const periodo of periodos) {
          valoresPorPeriodo.set(periodo.id, await this.calcularValorIndicador(indicador.formula, periodo.id));
        }
      } else {
        for (const dato of await this.resultados.resultadosGeneralPorIndicador(indicador.id)) {
          valoresPorPeriodo.set(dato.periodoId, dato.valor);
        }
      }
      // Metas configuradas del indicador (no solo el escalar Indicador.metaGlobal) — se
      // resuelve la vigente en cada período; a falta de una, se cae al global (compatibilidad).
      const metasIndicador: Meta[] = await this.metasRepo.listarPorIndicador(indicador.id);
      const puntos: PuntoHistorico[] = periodos.map((periodo) => {
        const valor = valoresPorPeriodo.get(periodo.id) ?? null;
        const metaVigente = metaVigenteParaPeriodo(metasIndicador, 'GENERAL', periodo, definiciones);
        const metaPeriodo = metaVigente?.valor ?? null;
        const meta = metaPeriodo ?? indicador.metaGlobal;
        const cumplimientoPct = valor != null && meta != null && meta !== 0 ? (valor / meta) * 100 : null;
        return { periodoId: periodo.id, etiqueta: periodo.etiqueta, fechaInicio: periodo.fechaInicio, valor, metaPeriodo, cumplimientoPct };
      });
      filas.push({
        indicadorId: indicador.id,
        nombre: indicador.nombre,
        lineaBase: indicador.lineaBase,
        metaGlobal: indicador.metaGlobal,
        unidadMedida: indicador.unidadMedida,
        ...this.clasificacionDe(indicador, nombreCategoria, nombreEquipo, usuariosPorId),
        puntos
      });
    }
    return filas;
  }

  /** Evalúa la fórmula de un indicador calculado para un período específico, a nivel GENERAL. */
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
      const datos = await this.resultados.resultadosGeneralPorIndicador(refIndicador.id);
      valores.set(codigo, datos.find((d) => d.periodoId === periodoId)?.valor ?? null);
    }
    try {
      return this.formulas.evaluar(formula, valores);
    } catch {
      return null;
    }
  }

  private async totalCombinaciones(
    desagregaciones: string[]
  ): Promise<{ total: number; conExclusiones: (excluidas: string[]) => number }> {
    const elementosPorLista = new Map<string, ElementoLista[]>();
    for (const listaId of desagregaciones) {
      elementosPorLista.set(listaId, await this.listas.listarElementos(listaId));
    }
    const total = this.productoCartesiano.generar(desagregaciones, elementosPorLista).length;
    return {
      total,
      conExclusiones: (excluidas) =>
        this.productoCartesiano.generar(desagregaciones, elementosPorLista, excluidas).length
    };
  }
}
