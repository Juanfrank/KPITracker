/**
 * Periodicidades soportadas por el sistema.
 * `Personalizada` está definida en el modelo pero su generación de períodos
 * no está implementada en esta versión (ver roadmap).
 */
export enum Periodicidad {
  Mensual = 'Mensual',
  Bimestral = 'Bimestral',
  Trimestral = 'Trimestral',
  Cuatrimestral = 'Cuatrimestral',
  Semestral = 'Semestral',
  Anual = 'Anual',
  Personalizada = 'Personalizada'
}

export interface PeriodicidadInfo {
  /** Cantidad de períodos por año (0 = no determinado, p. ej. Personalizada). */
  periodosPorAnio: number;
  /** Prefijo de etiqueta corta: T1, S1, etc. */
  prefijo: string;
  /** Meses que abarca cada período. */
  mesesPorPeriodo: number;
}

const INFO: Record<Periodicidad, PeriodicidadInfo> = {
  [Periodicidad.Mensual]: { periodosPorAnio: 12, prefijo: 'M', mesesPorPeriodo: 1 },
  [Periodicidad.Bimestral]: { periodosPorAnio: 6, prefijo: 'B', mesesPorPeriodo: 2 },
  [Periodicidad.Trimestral]: { periodosPorAnio: 4, prefijo: 'T', mesesPorPeriodo: 3 },
  [Periodicidad.Cuatrimestral]: { periodosPorAnio: 3, prefijo: 'C', mesesPorPeriodo: 4 },
  [Periodicidad.Semestral]: { periodosPorAnio: 2, prefijo: 'S', mesesPorPeriodo: 6 },
  [Periodicidad.Anual]: { periodosPorAnio: 1, prefijo: 'A', mesesPorPeriodo: 12 },
  [Periodicidad.Personalizada]: { periodosPorAnio: 0, prefijo: 'P', mesesPorPeriodo: 0 }
};

export function infoPeriodicidad(p: Periodicidad): PeriodicidadInfo {
  return INFO[p];
}

export const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
] as const;
