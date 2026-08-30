import type { AccionResultado, Adjunto, EntidadAdjunto } from '@domain/index';
import { EntidadNoEncontradaError, ValidacionError, equipoEfectivo, puedeSobreIndicador } from '@domain/index';
import type { IAdjuntoRepository, IArchivoService, IIndicadorRepository, IUsuarioRepository } from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';
import { permisosActuales } from './contextoUsuario';

/**
 * Evidencias adjuntas (archivos) sobre un levantamiento (indicador+período,
 * ver `Adjunto.entidadId`). El archivo físico se copia a /Data/Adjuntos; el
 * registro solo guarda metadatos y la ruta relativa.
 *
 * Hallazgo del audit de seguridad (batch AY+1, HIGH-1): antes de este cambio
 * ningún método de este servicio verificaba que el usuario en curso pudiera
 * VER/REGISTRAR el indicador dueño del levantamiento — bastaba una sesión
 * válida cualquiera para listar, subir, descargar o eliminar adjuntos de
 * CUALQUIER indicador, sin importar equipo/responsable. `exigirPermiso`
 * aplica el mismo criterio que ya usa `ServicioRecoleccion.indicadorConPermiso`
 * (ver ese archivo) — único punto de entrada de todo método público de acá.
 */
export class ServicioAdjuntos extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IAdjuntoRepository,
    private readonly archivos: IArchivoService,
    private readonly indicadores: IIndicadorRepository,
    private readonly usuarios: IUsuarioRepository
  ) {
    super(ctx);
  }

  /**
   * `entidadId` es siempre `"<indicadorId>:<periodoId>"` (ver `Adjunto`) — se
   * resuelve el indicador y se exige el permiso efectivo del usuario en
   * curso sobre él, mismo criterio y misma fuente de verdad
   * (`puedeSobreIndicador`) que gatea leer/escribir sus resultados.
   */
  private async exigirPermiso(entidadId: string, accion: AccionResultado): Promise<void> {
    const indicadorId = entidadId.split(':')[0] ?? entidadId;
    const indicador = await this.indicadores.obtener(indicadorId);
    if (!indicador) throw new EntidadNoEncontradaError('Indicador', indicadorId);
    const responsable = indicador.responsable ? await this.usuarios.obtener(indicador.responsable) : null;
    const usuariosPorId = new Map(responsable ? [[responsable.id, { equipoId: responsable.equipoId }] as const] : []);
    const equipoEfectivoId = equipoEfectivo(indicador, usuariosPorId);
    if (!puedeSobreIndicador(permisosActuales(), accion, { equipoEfectivoId, responsable: indicador.responsable })) {
      throw new ValidacionError('No tiene permiso para acceder a los adjuntos de este levantamiento.');
    }
  }

  async listarPorEntidad(entidad: EntidadAdjunto, entidadId: string): Promise<Adjunto[]> {
    await this.exigirPermiso(entidadId, 'ver');
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
    await this.exigirPermiso(entidadId, 'registrar');
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

  /**
   * Resuelve un adjunto y exige el mismo permiso ('ver') que gatea el
   * levantamiento al que pertenece. Punto de entrada obligatorio para
   * cualquier lectura de un adjunto por id — usado por `abrir()` (escritorio)
   * y por la descarga REST (`GET /api/adjuntos/:id/descarga`, ver
   * `src/server/rest/adjuntos.ts`), que antes leía el repo crudo sin pasar
   * por ningún chequeo de permiso.
   */
  async obtenerConPermiso(id: string): Promise<Adjunto> {
    const adjunto = await this.repo.obtener(id);
    if (!adjunto) throw new ValidacionError('El adjunto ya no existe.');
    await this.exigirPermiso(adjunto.entidadId, 'ver');
    return adjunto;
  }

  async abrir(id: string): Promise<void> {
    const adjunto = await this.obtenerConPermiso(id);
    await this.archivos.abrir(adjunto.rutaRelativa);
  }

  async eliminar(id: string): Promise<void> {
    const adjunto = await this.repo.obtener(id);
    if (!adjunto) return;
    await this.exigirPermiso(adjunto.entidadId, 'registrar');
    await this.archivos.eliminarArchivo(adjunto.rutaRelativa);
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', 'Adjunto', id, null, adjunto.nombreArchivo, null);
  }
}
