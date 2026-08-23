import express, { Router } from 'express';
import type { AplicacionServidor } from '../composicionServidor';
import { requireAuth } from './authMiddleware';
import { responderError } from './errores';

/**
 * `portable:exportar`/`portable:importar` ya trabajaban con JSON de texto
 * plano (no una ruta de diálogo) — a diferencia de `respaldo:*`, aquí no
 * hace falta `multer`: el cuerpo de la petición ES el JSON, se lee tal cual
 * con `express.text()` (evita un parse+stringify de ida y vuelta) y se pasa
 * directo a `ConfigPortableService.importar`, que ya hace su propio `JSON.parse`.
 */
export function crearRouterPortable(aplicacion: AplicacionServidor): Router {
  const router = Router();
  router.use(requireAuth(aplicacion));

  router.get('/exportar', async (_req, res) => {
    try {
      const json = await aplicacion.infra.configPortable.exportar();
      res.setHeader('Content-Disposition', 'attachment; filename="kpitracker-config.json"');
      res.setHeader('Content-Type', 'application/json');
      res.send(json);
    } catch (error) {
      responderError(res, error);
    }
  });

  router.post('/importar', express.text({ type: '*/*', limit: '20mb' }), async (req, res) => {
    try {
      const resultado = await aplicacion.infra.configPortable.importar(req.body as string);
      res.json(resultado);
    } catch (error) {
      responderError(res, error);
    }
  });

  return router;
}
