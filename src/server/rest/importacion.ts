import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Router } from 'express';
import multer from 'multer';
import { ValidacionError } from '@domain/index';
import type { AplicacionServidor } from '../composicionServidor';
import { requireAuth } from './authMiddleware';
import { responderError } from './errores';

const subida = multer({ dest: tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Reemplaza el par `sistema:seleccionarArchivo` + `sistema:leerHojaCalculo`
 * (dos canales solo porque el diálogo nativo entregaba una *ruta* que el
 * segundo releía) por un único paso: el navegador ya sube los bytes, así
 * que se leen directo del temporal que deja `multer` — sin diálogo que
 * abrir. Usa `ArchivoServiceWeb.leerHojaCalculo`, que no cambia en absoluto
 * entre una ruta "real" y una temporal.
 */
export function crearRouterImportacion(aplicacion: AplicacionServidor): Router {
  const router = Router();
  router.use(requireAuth(aplicacion));

  router.post('/hoja-calculo', subida.single('archivo'), async (req, res) => {
    const archivo = req.file;
    try {
      if (!archivo) throw new ValidacionError('No se recibió ningún archivo.');
      const resultado = await aplicacion.infra.archivos.leerHojaCalculo(archivo.path, archivo.originalname);
      res.json(resultado);
    } catch (error) {
      responderError(res, error);
    } finally {
      if (archivo) await unlink(archivo.path).catch(() => undefined);
    }
  });

  return router;
}
