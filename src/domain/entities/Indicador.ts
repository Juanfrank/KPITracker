import type { Periodicidad } from '../value-objects/Periodicidad';

export type EstadoIndicador = 'Activo' | 'Inactivo' | 'Borrador';

/**
 * Indicador institucional. Los atributos aquí presentes son los mínimos
 * obligatorios del sistema; el resto son atributos dinámicos definidos por
 * el usuario y almacenados vía EAV (FactValoresAtributos).
 */
export interface Indicador {
  readonly id: string;
  nombre: string;
  definicion: string;
  periodicidad: Periodicidad;
  lineaBase: number | null;
  /** Meta global simple; las metas detalladas viven en la entidad Meta. */
  metaGlobal: number | null;
  /** Ids de las listas de selección usadas como desagregaciones. */
  desagregaciones: string[];
  estado: EstadoIndicador;
  /** Preparado en la arquitectura; sin flujo funcional en esta versión. */
  responsable: string | null;
  /** Preparado en la arquitectura; sin flujo funcional en esta versión. */
  categoria: string | null;
  /** Unidad de medida para presentación (%, casos, días...). */
  unidadMedida: string | null;
  readonly creadoEn: string;
  actualizadoEn: string;
}
