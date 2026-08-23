import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { IdentidadSesion } from '@application/use-cases/ServicioAutenticacion';
import type { AplicacionServidor } from '../composicionServidor';

/** Nombre de la cookie de sesión — firmada (`cookie-parser` con secreto), nunca un JWT autocontenido (ver plan §3). */
export const COOKIE_SESION = 'kpitracker_sesion';

export interface Context {
  aplicacion: AplicacionServidor;
  usuario: IdentidadSesion | null;
  /** El token de sesión de la request actual (si la cookie era válida) — lo necesita `auth.logout` para revocarlo. */
  sesionId: string | null;
  res: CreateExpressContextOptions['res'];
}

/**
 * Fábrica de `createContext`: cierra sobre la `AplicacionServidor` (una sola
 * instancia para todo el proceso — un único espacio de trabajo compartido,
 * ver plan §0) y por cada request lee la cookie firmada, valida la sesión
 * contra `ServicioAutenticacion` y arma el contexto tRPC.
 */
export function crearContextFactory(aplicacion: AplicacionServidor) {
  return async function createContext({ req, res }: CreateExpressContextOptions): Promise<Context> {
    const cookies = req.signedCookies as Record<string, string | undefined> | undefined;
    const sesionId = cookies?.[COOKIE_SESION] ?? null;
    const usuario = sesionId ? await aplicacion.autenticacion.validarSesion(sesionId) : null;
    return { aplicacion, usuario, sesionId, res };
  };
}
