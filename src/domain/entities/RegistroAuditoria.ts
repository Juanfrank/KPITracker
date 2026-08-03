export type AccionAuditoria = 'Crear' | 'Modificar' | 'Eliminar' | 'Importar' | 'Exportar';

/**
 * Registro inmutable de auditoría. El campo `usuario` está preparado en la
 * arquitectura aunque en esta versión exista un único usuario local.
 */
export interface RegistroAuditoria {
  readonly id: string;
  readonly usuario: string;
  /** Fecha/hora ISO con zona. */
  readonly fechaHora: string;
  readonly accion: AccionAuditoria;
  /** Entidad modificada: 'Indicador', 'Resultado', 'Lista', ... */
  readonly entidad: string;
  readonly entidadId: string;
  /** Campo afectado (opcional, para modificaciones puntuales). */
  readonly campo: string | null;
  readonly valorAnterior: string | null;
  readonly valorNuevo: string | null;
}
