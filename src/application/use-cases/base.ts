import type { AccionAuditoria } from '@domain/index';
import type { IAuditoriaRepository, IClock, IExportService, IIdGenerator } from '@application/ports/index';

/** Usuario local único de esta versión; la arquitectura ya contempla múltiples. */
export const USUARIO_LOCAL = 'local';

export interface ContextoAplicacion {
  auditoria: IAuditoriaRepository;
  reloj: IClock;
  ids: IIdGenerator;
  exportacion: IExportService;
}

/**
 * Base de los servicios de aplicación: auditoría de toda modificación y
 * solicitud de resincronización de la capa analítica tras cada escritura.
 */
export abstract class ServicioBase {
  constructor(protected readonly ctx: ContextoAplicacion) {}

  protected async auditar(
    accion: AccionAuditoria,
    entidad: string,
    entidadId: string,
    campo: string | null = null,
    valorAnterior: unknown = null,
    valorNuevo: unknown = null
  ): Promise<void> {
    await this.ctx.auditoria.registrar({
      id: this.ctx.ids.nuevoId(),
      usuario: USUARIO_LOCAL,
      fechaHora: this.ctx.reloj.ahoraIso(),
      accion,
      entidad,
      entidadId,
      campo,
      valorAnterior: valorAnterior == null ? null : String(valorAnterior),
      valorNuevo: valorNuevo == null ? null : String(valorNuevo)
    });
  }

  protected sincronizarExport(): void {
    this.ctx.exportacion.solicitarRegeneracion();
  }
}
