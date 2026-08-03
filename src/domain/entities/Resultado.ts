/**
 * Resultado levantado para un indicador, un período y una combinación de
 * desagregación (o la fila General). Grano de FactResultados.
 */
export interface Resultado {
  readonly id: string;
  indicadorId: string;
  /** Id estable del período: "2025-Mensual-01". */
  periodoId: string;
  anio: number;
  /** Serialización canónica de ClaveDesagregacion ('GENERAL' para el total). */
  claveDesagregacion: string;
  valor: number | null;
  /** Comentario u observación opcional del levantamiento. */
  observacion: string | null;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/**
 * Estado del levantamiento de un indicador para un período: fecha de corte
 * única y obligatoria, y exclusiones temporales de desagregación que nunca
 * modifican la configuración del indicador.
 */
export interface Levantamiento {
  readonly id: string;
  indicadorId: string;
  periodoId: string;
  anio: number;
  /** Fecha de corte ISO (yyyy-MM-dd), compartida por todas las desagregaciones del período. */
  fechaCorte: string | null;
  /** Ids de listas de desagregación excluidas temporalmente en este período. */
  desagregacionesExcluidas: string[];
  readonly creadoEn: string;
  actualizadoEn: string;
}
