import type { Periodicidad } from '../value-objects/Periodicidad';

export type EstadoIndicador = 'Activo' | 'Inactivo' | 'Borrador';

/**
 * Indicador institucional. Los atributos aquí presentes son los mínimos
 * obligatorios del sistema; el resto son atributos dinámicos definidos por
 * el usuario y almacenados vía EAV (FactValoresAtributos).
 */
export interface Indicador {
  readonly id: string;
  /** Código único visible (p. ej. "IND-001"); distinto del id interno. */
  codigo: string;
  nombre: string;
  definicion: string;
  periodicidad: Periodicidad;
  /** Id de DefinicionPeriodicidad; requerido cuando periodicidad = Personalizada. */
  periodicidadPersonalizadaId: string | null;
  lineaBase: number | null;
  /** Id de Periodo al que corresponde el valor de lineaBase. */
  lineaBasePeriodoId: string | null;
  /** Meta global simple; las metas detalladas viven en la entidad Meta. */
  metaGlobal: number | null;
  /** Ids de las listas de selección usadas como desagregaciones. */
  desagregaciones: string[];
  estado: EstadoIndicador;
  /** Id de Responsable (catálogo). */
  responsable: string | null;
  /** Id de Categoria (catálogo). */
  categoria: string | null;
  /** Unidad de medida para presentación (%, casos, días...). */
  unidadMedida: string | null;
  /** Si es true, el valor de sus resultados se calcula a partir de `formula` en vez de capturarse. */
  esCalculado: boolean;
  /** Expresión aritmética sobre códigos de otros indicadores (p. ej. "IND-001 + IND-002 * 0.5"). Requerida cuando esCalculado = true. */
  formula: string | null;
  readonly creadoEn: string;
  actualizadoEn: string;
}
