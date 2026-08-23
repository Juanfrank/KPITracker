import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Router } from 'express';
import multer from 'multer';
import type { EntidadAdjunto } from '@domain/index';
import { ValidacionError } from '@domain/index';
import type { AplicacionServidor } from '../composicionServidor';
import { requireAuth } from './authMiddleware';
import { responderError } from './errores';

const subida = multer({ dest: tmpdir(), limits: { fileSize: 100 * 1024 * 1024 } });

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

  router.post('/', subida.single('archivo'), async (req, res) => {
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
      const adjunto = await aplicacion.infra.adjuntos.obtener(req.params.id);
      if (!adjunto) {
        res.status(404).json({ error: 'El adjunto ya no existe.' });
        return;
      }
      res.download(aplicacion.infra.archivos.rutaAbsoluta(adjunto.rutaRelativa), adjunto.nombreArchivo);
    } catch (error) {
      responderError(res, error);
    }
  });

  return router;
}
