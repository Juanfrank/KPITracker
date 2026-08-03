import type { ReglaFechaLimiteSpec } from '../deadline-rules/DeadlineRule';

/** Parámetros globales de la aplicación, editables desde Configuración General. */
export interface ConfiguracionGeneral {
  /** Año desde el cual pueden levantarse resultados. */
  anioInicial: number;
  /** Regla declarativa de fecha límite de llenado (Strategy + registry). */
  reglaFechaLimite: ReglaFechaLimiteSpec;
  /** Además del Parquet (siempre), exportar la capa analítica también a CSV UTF-8. */
  exportarCsv: boolean;
  /** Nombre de la institución para reportes y export. */
  nombreInstitucion: string;
  /** Tema de la interfaz. */
  tema: 'claro' | 'oscuro' | 'sistema';
  /** Versión del esquema de configuración (para migraciones). */
  schemaVersion: number;
}

export const CONFIG_SCHEMA_VERSION = 2;

export function configuracionPorDefecto(): ConfiguracionGeneral {
  return {
    anioInicial: new Date().getFullYear(),
    reglaFechaLimite: { tipo: 'DiaFijoDelMes', parametros: { dia: 10 } },
    exportarCsv: false,
    nombreInstitucion: '',
    tema: 'sistema',
    schemaVersion: CONFIG_SCHEMA_VERSION
  };
}
