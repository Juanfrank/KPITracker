/** Entidad a la que se adjunta evidencia: el levantamiento (indicador+período) de la Recolección. */
export type EntidadAdjunto = 'Levantamiento';

/**
 * Evidencia adjunta (archivo) asociada a un levantamiento (indicador +
 * período de Recolección) — no a la definición del indicador. A lo sumo un
 * adjunto por levantamiento, siempre opcional. `entidadId` es la clave
 * compuesta `"<indicadorId>:<periodoId>"`. El archivo físico se copia a
 * Data/Adjuntos; aquí solo se guarda la ruta relativa y metadatos.
 */
export interface Adjunto {
  readonly id: string;
  entidad: EntidadAdjunto;
  entidadId: string;
  nombreArchivo: string;
  /** Ruta relativa dentro de /Data (p. ej. "Adjuntos/<id>_reporte.pdf"). */
  rutaRelativa: string;
  tamanioBytes: number;
  comentario: string | null;
  readonly subidoEn: string;
}
