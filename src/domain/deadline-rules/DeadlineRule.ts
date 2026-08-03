import type { Periodo } from '../value-objects/Periodo';

/**
 * Especificación declarativa y serializable de la regla de fecha límite.
 * Se persiste en la configuración; el registro resuelve la estrategia.
 */
export interface ReglaFechaLimiteSpec {
  tipo: string;
  parametros: Record<string, unknown>;
}

/**
 * Estrategia de cálculo de fecha límite de llenado para un período.
 * Nuevas reglas se agregan implementando esta interfaz y registrándola,
 * sin modificar módulos existentes (OCP).
 */
export interface DeadlineRule {
  readonly tipo: string;
  readonly etiqueta: string;
  /** Descripción de los parámetros esperados, para construir la UI dinámicamente. */
  readonly parametros: Array<{ nombre: string; etiqueta: string; tipo: 'number' | 'weekday'; min?: number; max?: number }>;
  /**
   * Calcula la fecha límite (ISO yyyy-MM-dd) para llenar el período dado.
   * Por convención, la fecha límite se calcula respecto al mes siguiente al
   * cierre del período (el levantamiento ocurre después de cerrar el período).
   */
  calcular(periodo: Periodo, parametros: Record<string, unknown>): string;
}
