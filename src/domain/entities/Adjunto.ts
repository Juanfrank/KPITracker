/** Entidad a la que se adjunta evidencia: un indicador o un resultado puntual. */
export type EntidadAdjunto = 'Indicador' | 'Resultado';

/**
 * Evidencia adjunta (archivo) asociada a un indicador o a un resultado.
 * El archivo físico se copia a Data/Adjuntos; aquí solo se guarda la ruta
 * relativa y metadatos.
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
