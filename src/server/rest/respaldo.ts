import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { Router } from 'express';
import multer from 'multer';
import { ValidacionError } from '@domain/index';
import type { SeleccionRespaldo } from '@infrastructure/perfiles/esquemaRespaldo';
import type { AplicacionServidor } from '../composicionServidor';
import { requireAuth } from './authMiddleware';
import { responderError } from './errores';

const subida = multer({ dest: tmpdir(), limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * Reemplaza `respaldo:exportar` (diálogo de guardado) y el par
 * `respaldo:seleccionar` (diálogo de apertura + preview) / `respaldo:importar`.
 * Como la UI de importación selectiva necesita el preview (`ResumenRespaldo`)
 * ANTES de que el usuario elija qué importar, se exponen dos rutas de
 * subida en vez de una — el plan (§5) las agrupaba en una sola por brevedad,
 * pero el flujo real de dos pasos (`respaldo:seleccionar` → `respaldo:importar`)
 * lo exige.
 */
export function crearRouterRespaldo(aplicacion: AplicacionServidor): Router {
  const router = Router();
  router.use(requireAuth(aplicacion));

  router.get('/exportar', async (_req, res) => {
    try {
      const json = await aplicacion.infra.respaldoPerfil.exportar();
      const nombreArchivo = `respaldo-kpitracker-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
      res.setHeader('Content-Type', 'application/json');
      res.send(json);
    } catch (error) {
      responderError(res, error);
    }
  });

  /** Preview: parsea y valida el archivo (migrándolo si hace falta) sin escribir nada — equivalente a `respaldo:seleccionar`. */
  router.post('/leer', subida.single('archivo'), async (req, res) => {
    const archivo = req.file;
    try {
      if (!archivo) throw new ValidacionError('No se recibió ningún archivo.');
      const texto = await readFile(archivo.path, 'utf-8');
      const resumen = aplicacion.infra.respaldoPerfil.leer(texto);
      res.json(resumen);
    } catch (error) {
      responderError(res, error);
    } finally {
      if (archivo) await unlink(archivo.path).catch(() => undefined);
    }
  });

  router.post('/importar', subida.single('archivo'), async (req, res) => {
    const archivo = req.file;
    try {
      if (!archivo) throw new ValidacionError('No se recibió ningún archivo.');
      const seleccionCruda = (req.body as { seleccion?: string }).seleccion;
      if (!seleccionCruda) throw new ValidacionError('Falta el campo "seleccion".');
      const seleccion = JSON.parse(seleccionCruda) as SeleccionRespaldo;
      const texto = await readFile(archivo.path, 'utf-8');
      const resultado = await aplicacion.infra.respaldoPerfil.importar(texto, seleccion);
      res.json(resultado);
    } catch (error) {
      responderError(res, error);
    } finally {
      if (archivo) await unlink(archivo.path).catch(() => undefined);
    }
  });

  return router;
}
