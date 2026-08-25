import { createReadStream, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import type { AplicacionServidor } from '../composicionServidor';
import { requireAuth } from './authMiddleware';
import { responderError } from './errores';

/**
 * Batch X (X13): reemplaza el antiguo botón "Regenerar ahora" — que solo
 * regeneraba el archivo en el servidor y mostraba su ruta en disco — por una
 * descarga real al navegador. Regenera con `forzarCsv:true` (el CSV es el
 * único de los dos formatos que un navegador puede mostrar/abrir
 * razonablemente) y transmite el archivo resultante como adjunto.
 */
export function crearRouterExportacion(aplicacion: AplicacionServidor): Router {
  const router = Router();
  router.use(requireAuth(aplicacion));

  router.get('/descargar', async (_req, res) => {
    try {
      await aplicacion.infra.exportacion.regenerar(true);
      const ruta = join(aplicacion.infra.exportacion.rutaExportacion(), 'ResultadosAnalitico.csv');
      if (!existsSync(ruta)) {
        res.status(404).json({ error: 'No se generó el archivo de exportación.' });
        return;
      }
      res.setHeader('Content-Disposition', 'attachment; filename="ResultadosAnalitico.csv"');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      createReadStream(ruta).pipe(res);
    } catch (error) {
      responderError(res, error);
    }
  });

  return router;
}
