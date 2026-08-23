import type { Adjunto, EntidadAdjunto } from '@domain/index';
import { ValidacionError } from '@domain/index';
import type { IAdjuntoRepository, IArchivoService } from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';

/**
 * Evidencias adjuntas (archivos) sobre un indicador o un resultado puntual.
 * El archivo físico se copia a /Data/Adjuntos; el registro solo guarda
 * metadatos y la ruta relativa.
 */
export class ServicioAdjuntos extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IAdjuntoRepository,
    private readonly archivos: IArchivoService
  ) {
    super(ctx);
  }

  listarPorEntidad(entidad: EntidadAdjunto, entidadId: string): Promise<Adjunto[]> {
    return this.repo.listarPorEntidad(entidad, entidadId);
  }

  /** Abre el diálogo nativo, copia el archivo elegido y crea el registro. Null si el usuario cancela. Solo tiene sentido con un `IArchivoService` que sepa mostrar diálogos (app de escritorio). */
  async subir(entidad: EntidadAdjunto, entidadId: string, comentario: string | null = null): Promise<Adjunto | null> {
    const rutaOrigen = await this.archivos.seleccionarArchivo();
    if (!rutaOrigen) return null;

    const nombreArchivo = rutaOrigen.split(/[/\\]/).pop() ?? rutaOrigen;
    return this.subirDesdeArchivo(entidad, entidadId, rutaOrigen, nombreArchivo, comentario);
  }

  /**
   * Variante web: el archivo ya llegó (subido vía multipart, ver
   * `src/server/rest/adjuntos.ts`) a una ruta temporal en disco — a
   * diferencia de `subir()`, no hay diálogo nativo que abrir, el navegador
   * ya lo eligió del lado del cliente. Reutiliza la misma lógica de copia a
   * `/Data/Adjuntos` + registro que `subir()`.
   */
  async subirDesdeArchivo(
    entidad: EntidadAdjunto, entidadId: string, rutaArchivo: string, nombreOriginal: string, comentario: string | null = null
  ): Promise<Adjunto> {
    const { rutaRelativa, tamanioBytes } = await this.archivos.guardarAdjunto(rutaArchivo, nombreOriginal);

    const ahora = this.ctx.reloj.ahoraIso();
    const adjunto: Adjunto = {
      id: this.ctx.ids.nuevoId(),
      entidad,
      entidadId,
      nombreArchivo: nombreOriginal,
      rutaRelativa,
      tamanioBytes,
      comentario,
      subidoEn: ahora
    };
    await this.repo.guardar(adjunto);
    await this.auditar('Crear', 'Adjunto', adjunto.id, null, null, nombreOriginal);
    return adjunto;
  }

  async abrir(id: string): Promise<void> {
    const adjunto = await this.repo.obtener(id);
    if (!adjunto) throw new ValidacionError('El adjunto ya no existe.');
    await this.archivos.abrir(adjunto.rutaRelativa);
  }

  async eliminar(id: string): Promise<void> {
    const adjunto = await this.repo.obtener(id);
    if (!adjunto) return;
    await this.archivos.eliminarArchivo(adjunto.rutaRelativa);
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', 'Adjunto', id, null, adjunto.nombreArchivo, null);
  }
}
