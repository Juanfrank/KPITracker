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
  /** Explicación en texto libre de cómo se calcula el indicador; puede incluir notación matemática (opcional). */
  formaCalculo: string | null;
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
  /** Id de Usuario (responsable directo, Batch U unificó Usuario/Responsable). Determina el vínculo INDIRECTO a un equipo (vía `Usuario.equipoId`), salvo que `equipo` esté seteado, que prevalece — ver `equipoEfectivo`. */
  responsable: string | null;
  /** Id de Categoria (catálogo). */
  categoria: string | null;
  /** Id de Equipo (catálogo) — vínculo DIRECTO, independiente del responsable. */
  equipo: string | null;
  /** Unidad de medida para presentación (%, casos, días...). */
  unidadMedida: string | null;
  /** Si es true, el valor de sus resultados se calcula a partir de `formula` en vez de capturarse. */
  esCalculado: boolean;
  /** Expresión aritmética sobre códigos de otros indicadores (p. ej. "IND-001 + IND-002 * 0.5"). Requerida cuando esCalculado = true. */
  formula: string | null;
  /**
   * Si es `false` (Batch U, U7), sus resultados nunca pasan por el flujo de
   * aprobación (Batch T5) — la UI de Recolección oculta la columna/los
   * botones de validación para este indicador, y sus resultados quedan
   * permanentemente en el estado que tengan, sin revisión visible. No
   * cambia `puedeSobreIndicador`/`ServicioRecoleccion`: quien tenga el
   * permiso de validar sigue pudiendo hacerlo por API si quisiera, esto es
   * puramente una preferencia de presentación por indicador. Default
   * `true` — el comportamiento actual (todo indicador requiere validación)
   * no cambia salvo que se desmarque explícitamente.
   */
  requiereValidacion: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}
