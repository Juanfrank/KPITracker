import express from 'express';
import cookieParser from 'cookie-parser';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { componerAplicacionServidor } from './composicionServidor';
import type { AplicacionServidor } from './composicionServidor';
import { appRouter } from './trpc/appRouter';
import { crearContextFactory } from './trpc/context';
import { crearRouterAdjuntos } from './rest/adjuntos';
import { crearRouterImportacion } from './rest/importacion';
import { crearRouterRespaldo } from './rest/respaldo';
import { crearRouterPortable } from './rest/portable';

export interface OpcionesApp {
  dataDir: string;
  appVersion?: string;
}

export interface AppConstruida {
  app: express.Express;
  aplicacion: AplicacionServidor;
  cerrar(): Promise<void>;
}

/**
 * Fábrica testeable del servidor Express — construye la `app` SIN escuchar
 * en ningún puerto (`index.ts` es el único que llama `.listen()`), para que
 * los tests puedan levantarla sobre un puerto efímero (`.listen(0)`) contra
 * un `dataDir` temporal, igual que hoy `componerAplicacion` en los tests de
 * integración de la app de escritorio.
 *
 * NO se usa `express.json()` global: `createExpressMiddleware` de tRPC lee
 * el cuerpo crudo de la request él mismo — un parser JSON global antes lo
 * dejaría vacío. Las rutas REST que sí necesitan parsear cuerpo (multipart
 * vía `multer`, o texto plano en `/api/portable/importar`) lo declaran cada
 * una por su cuenta, scoped a su propio router.
 */
export async function crearApp(opciones: OpcionesApp): Promise<AppConstruida> {
  const aplicacion = await componerAplicacionServidor(opciones.dataDir, opciones.appVersion);

  const app = express();
  app.disable('x-powered-by');
  app.use(cookieParser(secretoCookie()));

  app.use('/api/trpc', createExpressMiddleware({ router: appRouter, createContext: crearContextFactory(aplicacion) }));
  app.use('/api/adjuntos', crearRouterAdjuntos(aplicacion));
  app.use('/api/importacion', crearRouterImportacion(aplicacion));
  app.use('/api/respaldo', crearRouterRespaldo(aplicacion));
  app.use('/api/portable', crearRouterPortable(aplicacion));

  return { app, aplicacion, cerrar: () => aplicacion.cerrar() };
}

/** Secreto para firmar la cookie de sesión — obligatorio en producción, con un valor de desarrollo predecible fuera de ella. */
function secretoCookie(): string {
  const secreto = process.env.COOKIE_SECRET;
  if (secreto) return secreto;
  if (process.env.NODE_ENV === 'production') throw new Error('Falta la variable de entorno COOKIE_SECRET (obligatoria en producción).');
  return 'kpitracker-dev-secret-cambiar-en-produccion';
}
