import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
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
import { crearRouterExportacion } from './rest/exportacion';

/** `out/renderer` (build de `vite.config.ts`) relativo a este archivo — no a `process.cwd()`, para no depender de dónde se invoque el proceso. */
const RUTA_SPA = fileURLToPath(new URL('../../out/renderer', import.meta.url));

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
  app.use(cabecerasSeguridad);
  app.use(cookieParser(secretoCookie()));

  app.use('/api/trpc', createExpressMiddleware({ router: appRouter, createContext: crearContextFactory(aplicacion) }));
  app.use('/api/adjuntos', crearRouterAdjuntos(aplicacion));
  app.use('/api/importacion', crearRouterImportacion(aplicacion));
  app.use('/api/respaldo', crearRouterRespaldo(aplicacion));
  app.use('/api/portable', crearRouterPortable(aplicacion));
  app.use('/api/exportacion', crearRouterExportacion(aplicacion));

  // Bundle de la SPA (`npm run build`, ver plan Fase 4 §9.8) — montado
  // DESPUÉS de toda ruta /api/*, así nunca la intercepta. En dev, la SPA la
  // sirve el propio `vite` (proxy /api hacia este servidor, ver
  // `vite.config.ts`) — este bloque solo importa en producción/E2E, donde
  // `out/renderer` puede no existir todavía (p. ej. tests que no construyen
  // la SPA), de ahí el `existsSync`.
  if (existsSync(RUTA_SPA)) {
    app.use(express.static(RUTA_SPA));
    // Sin path (no `'*'`): Express 5 cambió a path-to-regexp v7, que ya no
    // acepta el comodín suelto de Express 4 — un middleware sin ruta es el
    // catch-all portable entre versiones, y de todas formas solo se llega
    // aquí para lo que `express.static` no resolvió.
    app.use((_req, res) => res.sendFile(`${RUTA_SPA}/index.html`));
  }

  return { app, aplicacion, cerrar: () => aplicacion.cerrar() };
}

/**
 * Cabeceras de hardening (audit de seguridad, MEDIUM): antes de este cambio
 * solo `x-powered-by` estaba deshabilitada — sin CSP por header (el `<meta>`
 * de `index.html` no cubre `frame-ancestors`, que la especificación CSP
 * prohíbe declarar vía `<meta>`), sin `X-Frame-Options` (la app podía
 * embeberse en un `<iframe>` de cualquier origen — clickjacking), sin
 * `X-Content-Type-Options` ni `Referrer-Policy`. Aplica a TODA respuesta
 * (API incluida, no solo la SPA) — barato y sin efecto observable en el uso
 * normal, ya que la política ya es efectivamente same-origin (mismo origen
 * sirve la SPA y `/api/*`, ver comentario de `crearApp`). HSTS solo en
 * producción, mismo criterio que la cookie `secure` (ver `authRouter.login`)
 * — en HTTP plano el navegador la ignora igual, pero fijarla sin TLS de por
 * medio no aporta nada y podría confundir a quien inspeccione las cabeceras
 * en desarrollo.
 */
function cabecerasSeguridad(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
      "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

/** Secreto para firmar la cookie de sesión — obligatorio en producción, con un valor de desarrollo predecible fuera de ella. */
function secretoCookie(): string {
  const secreto = process.env.COOKIE_SECRET;
  if (secreto) return secreto;
  if (process.env.NODE_ENV === 'production') throw new Error('Falta la variable de entorno COOKIE_SECRET (obligatoria en producción).');
  return 'kpitracker-dev-secret-cambiar-en-produccion';
}
