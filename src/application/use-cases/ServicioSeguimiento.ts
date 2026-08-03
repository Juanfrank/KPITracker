import {
  CalculadoraEstados, GeneradorPeriodos, ProductoCartesiano
} from '@domain/index';
import type {
  DeadlineRuleRegistry, ElementoLista, EstadoPeriodo, EstadoSeguimiento, Periodicidad
} from '@domain/index';
import type {
  IConfiguracionRepository, IIndicadorRepository, IListaRepository, IResultadoRepository
} from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';

export interface FilaTablero {
  indicadorId: string;
  nombre: string;
  estado: EstadoSeguimiento;
  periodicidad: Periodicidad;
  periodoPendiente: string | null;
  fechaLimite: string | null;
  fechaCorte: string | null;
  ultimaActualizacion: string | null;
  responsable: string | null;
  categoria: string | null;
  totalPeriodos: number;
  periodosCompletos: number;
}

export interface DetalleSeguimiento {
  indicadorId: string;
  nombre: string;
  estados: EstadoPeriodo[];
}

/**
 * Tablero de seguimiento: calcula dinámicamente el estado de cada
 * indicador combinando fecha actual, regla de fecha límite, periodicidad,
 * períodos registrados y fecha de corte. No usa banderas persistidas.
 */
export class ServicioSeguimiento extends ServicioBase {
  private readonly generadorPeriodos = new GeneradorPeriodos();
  private readonly productoCartesiano = new ProductoCartesiano();
  private readonly calculadora: CalculadoraEstados;

  constructor(
    ctx: ContextoAplicacion,
    private readonly indicadores: IIndicadorRepository,
    private readonly listas: IListaRepository,
    private readonly resultados: IResultadoRepository,
    private readonly configuracion: IConfiguracionRepository,
    reglasFechaLimite: DeadlineRuleRegistry
  ) {
    super(ctx);
    this.calculadora = new CalculadoraEstados(reglasFechaLimite);
  }

  async tablero(): Promise<FilaTablero[]> {
    const [config, indicadores, resumen, levantamientos] = await Promise.all([
      this.configuracion.obtener(),
      this.indicadores.listar(),
      this.resultados.resumenGlobal(),
      this.resultados.listarLevantamientos()
    ]);
    const hoy = this.ctx.reloj.hoyIso();
    const filas: FilaTablero[] = [];

    for (const indicador of indicadores) {
      const totalCombinaciones = await this.totalCombinaciones(indicador.id, indicador.desagregaciones);
      const periodos = this.generadorPeriodos.periodosCerrados(config.anioInicial, indicador.periodicidad, hoy);
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
        nombre: indicador.nombre,
        estado: indicador.estado !== 'Activo' ? 'NoAplica' : (pendiente?.estado ?? (estados.length > 0 ? 'Completo' : 'NoAplica')),
        periodicidad: indicador.periodicidad,
        periodoPendiente: pendiente?.periodo.etiqueta ?? null,
        fechaLimite: pendiente?.fechaLimite ?? null,
        fechaCorte: pendiente?.fechaCorte ?? null,
        ultimaActualizacion: ultimas[ultimas.length - 1] ?? null,
        responsable: indicador.responsable,
        categoria: indicador.categoria,
        totalPeriodos: estados.length,
        periodosCompletos: estados.filter((e) => e.estado === 'Completo').length
      });
    }
    return filas;
  }

  /** Detalle por período de un indicador (panel lateral del tablero). */
  async detalle(indicadorId: string): Promise<DetalleSeguimiento | null> {
    const indicador = await this.indicadores.obtener(indicadorId);
    if (!indicador) return null;
    const config = await this.configuracion.obtener();
    const hoy = this.ctx.reloj.hoyIso();
    const [resumen, levantamientos] = await Promise.all([
      this.resultados.resumenPorIndicador(indicadorId),
      this.resultados.listarLevantamientos(indicadorId)
    ]);
    const totalCombinaciones = await this.totalCombinaciones(indicadorId, indicador.desagregaciones);
    const periodos = this.generadorPeriodos.periodosCerrados(config.anioInicial, indicador.periodicidad, hoy);

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

  private async totalCombinaciones(
    _indicadorId: string,
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
