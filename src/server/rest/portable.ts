import express, { Router } from 'express';
import { puedeImportarExportarRespaldo } from '@domain/index';
import type { AplicacionServidor } from '../composicionServidor';
import { requireAuth, requierePermiso } from './authMiddleware';
import { responderError } from './errores';

/**
 * `portable:exportar`/`portable:importar` ya trabajaban con JSON de texto
 * plano (no una ruta de diálogo) — a diferencia de `respaldo:*`, aquí no
 * hace falta `multer`: el cuerpo de la petición ES el JSON, se lee tal cual
 * con `express.text()` (evita un parse+stringify de ida y vuelta) y se pasa
 * directo a `ConfigPortableService.importar`, que ya hace su propio `JSON.parse`.
 * Batch X (X7): mismo permiso `respaldo.importarExportar` que `respaldo:*`
 * — es el mismo concepto de negocio ("exportar/importar todo"), no tiene
 * sentido un permiso aparte solo porque el mecanismo interno es distinto.
 */
export function crearRouterPortable(aplicacion: AplicacionServidor): Router {
  const router = Router();
  router.use(requireAuth(aplicacion));
  router.use(requierePermiso(puedeImportarExportarRespaldo, 'Requiere permiso para importar/exportar respaldos.'));

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
