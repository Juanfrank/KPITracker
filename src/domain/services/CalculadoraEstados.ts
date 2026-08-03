import type { Periodo } from '../value-objects/Periodo';
import type { ReglaFechaLimiteSpec } from '../deadline-rules/DeadlineRule';
import type { DeadlineRuleRegistry } from '../deadline-rules/DeadlineRuleRegistry';

export type EstadoSeguimiento = 'Pendiente' | 'EnProgreso' | 'Completo' | 'Vencido' | 'NoAplica';

export interface EstadoPeriodo {
  periodo: Periodo;
  estado: EstadoSeguimiento;
  fechaLimite: string;
  fechaCorte: string | null;
  totalCombinaciones: number;
  combinacionesConValor: number;
}

export interface DatosLevantamientoPeriodo {
  periodo: Periodo;
  /** null si no se ha iniciado el levantamiento. */
  fechaCorte: string | null;
  totalCombinaciones: number;
  combinacionesConValor: number;
  ultimaActualizacion: string | null;
}

/**
 * Calcula dinámicamente el estado de cada período de un indicador.
 * NUNCA depende de un campo booleano persistido: combina fecha actual,
 * regla de fecha límite, periodicidad, resultados registrados y fecha de
 * corte (Lógica de Pendientes de la especificación).
 */
export class CalculadoraEstados {
  constructor(private readonly reglasFechaLimite: DeadlineRuleRegistry) {}

  calcularEstadoPeriodo(
    datos: DatosLevantamientoPeriodo,
    reglaFechaLimite: ReglaFechaLimiteSpec,
    hoyIso: string,
    indicadorActivo: boolean
  ): EstadoPeriodo {
    const fechaLimite = this.reglasFechaLimite.calcular(reglaFechaLimite, datos.periodo);
    let estado: EstadoSeguimiento;

    if (!indicadorActivo) {
      estado = 'NoAplica';
    } else if (datos.periodo.fechaFin >= hoyIso) {
      // El período aún no cierra: no corresponde levantarlo todavía.
      estado = 'NoAplica';
    } else {
      const completo =
        datos.totalCombinaciones > 0 &&
        datos.combinacionesConValor >= datos.totalCombinaciones &&
        datos.fechaCorte != null;
      const iniciado = datos.combinacionesConValor > 0 || datos.fechaCorte != null;
      if (completo) {
        estado = 'Completo';
      } else if (hoyIso > fechaLimite) {
        estado = 'Vencido';
      } else if (iniciado) {
        estado = 'EnProgreso';
      } else {
        estado = 'Pendiente';
      }
    }

    return {
      periodo: datos.periodo,
      estado,
      fechaLimite,
      fechaCorte: datos.fechaCorte,
      totalCombinaciones: datos.totalCombinaciones,
      combinacionesConValor: datos.combinacionesConValor
    };
  }

  /** Primer período no completo (el "período pendiente" del tablero). */
  periodoPendiente(estados: EstadoPeriodo[]): EstadoPeriodo | null {
    return estados.find((e) => e.estado === 'Pendiente' || e.estado === 'EnProgreso' || e.estado === 'Vencido') ?? null;
  }
}
