import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import type { EntidadAdjunto } from '@domain/index';
import { ValidacionError } from '@domain/index';
import type { AplicacionServidor } from '../composicionServidor';
import { requireAuth } from './authMiddleware';
import { responderError } from './errores';

/**
 * Lista blanca de extensiones para evidencias adjuntas (audit de seguridad,
 * LOW-2): antes, cualquier tipo de archivo pasaba sin ningún filtro (solo el
 * tope de 100MB). No es la única defensa — el nombre en disco se sanea y
 * randomiza (`ArchivoServiceWeb.guardarAdjunto`) y la descarga siempre va
 * con `Content-Disposition: attachment` (`res.download`, nunca inline) — es
 * defensa en profundidad adicional, acotando qué puede llegar a subirse en
 * primer lugar a los tipos de evidencia esperables.
 */
const EXTENSIONES_PERMITIDAS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt',
  'jpg', 'jpeg', 'png', 'gif', 'webp'
]);

function extensionPermitida(nombreArchivo: string): boolean {
  const punto = nombreArchivo.lastIndexOf('.');
  if (punto < 0) return false;
  return EXTENSIONES_PERMITIDAS.has(nombreArchivo.slice(punto + 1).toLowerCase());
}

const subida = multer({
  dest: tmpdir(),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!extensionPermitida(file.originalname)) {
      cb(new ValidacionError(
        `Tipo de archivo no permitido ("${file.originalname}"). Formatos aceptados: ${[...EXTENSIONES_PERMITIDAS].sort().join(', ')}.`
      ));
      return;
    }
    cb(null, true);
  }
});

/** `multer` reporta un `fileFilter` rechazado (u otro error, p. ej. tamaño excedido) vía el callback de error de Express — sin este wrapper, caería al manejador de error genérico de Express (HTML), no al sobre JSON `{ error, detalles }` que espera el cliente. */
function subirArchivoMiddleware(req: Request, res: Response, next: NextFunction): void {
  subida.single('archivo')(req, res, (error: unknown) => {
    if (error) {
      responderError(res, error instanceof Error ? error : new Error(String(error)));
      return;
    }
    next();
  });
}

/**
 * Reemplaza `adjuntos:subir` (subía vía diálogo nativo, ver plan §5) y
 * `adjuntos:abrir` (`shell.openPath`, sin equivalente web). El navegador
 * elige el archivo del lado del cliente; `multer` lo deposita en un
 * temporal que `ServicioAdjuntos.subirDesdeArchivo` copia a `/Data/Adjuntos`
 * (mismo flujo que ya usa `subir()`, incluida la auditoría).
 */
export function crearRouterAdjuntos(aplicacion: AplicacionServidor): Router {
  const router = Router();
  router.use(requireAuth(aplicacion));

  router.post('/', subirArchivoMiddleware, async (req, res) => {
    const archivo = req.file;
    try {
      if (!archivo) throw new ValidacionError('No se recibió ningún archivo.');
      const { entidad, entidadId, comentario } = req.body as { entidad?: string; entidadId?: string; comentario?: string };
      if (!entidad || !entidadId) throw new ValidacionError('Faltan los campos "entidad" y "entidadId".');

      const adjunto = await aplicacion.servicios.adjuntos.subirDesdeArchivo(
        entidad as EntidadAdjunto, entidadId, archivo.path, archivo.originalname, comentario || null
      );
      res.status(201).json(adjunto);
    } catch (error) {
      responderError(res, error);
    } finally {
      if (archivo) await unlink(archivo.path).catch(() => undefined);
    }
  });

  router.get('/:id/descarga', async (req, res) => {
    try {
      // Pasa por `ServicioAdjuntos.obtenerConPermiso` (no el repo crudo) —
      // exige el mismo permiso 'ver' que gatea el indicador dueño del
      // levantamiento, ver el docstring de `ServicioAdjuntos` (audit de
      // seguridad, HIGH-1).
      const adjunto = await aplicacion.servicios.adjuntos.obtenerConPermiso(req.params.id);
      res.download(aplicacion.infra.archivos.rutaAbsoluta(adjunto.rutaRelativa), adjunto.nombreArchivo);
    } catch (error) {
      responderError(res, error);
    }
  });

  return router;
}
