import type { NextFunction, Request, Response } from 'express';
import type { IdentidadSesion } from '@application/use-cases/ServicioAutenticacion';
import { conUsuario } from '@application/use-cases/contextoUsuario';
import { COOKIE_SESION } from '../trpc/context';
import type { AplicacionServidor } from '../composicionServidor';

export interface RequestConUsuario extends Request {
  usuario: IdentidadSesion;
}

/**
 * Equivalente REST de `protectedProcedure` (ver `trpc.ts`): valida la misma
 * cookie firmada de sesión y, si es válida, cuelga `req.usuario` y establece
 * la identidad ambiente (`conUsuario`) para que la auditoría de lo que haga
 * el handler downstream quede atribuida al usuario correcto — exactamente
 * igual que en tRPC, solo que aquí el "next resolver" es el resto de la
 * cadena de middlewares de Express en vez de un resolver de tRPC.
 */
export function requireAuth(aplicacion: AplicacionServidor) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const cookies = req.signedCookies as Record<string, string | undefined> | undefined;
    const sesionId = cookies?.[COOKIE_SESION];

    (async () => {
      const usuario = sesionId ? await aplicacion.autenticacion.validarSesion(sesionId) : null;
      if (!usuario) {
        res.status(401).json({ error: 'Se requiere iniciar sesión.' });
        return;
      }
      (req as RequestConUsuario).usuario = usuario;
      await conUsuario(usuario.id, async () => next());
    })().catch(next);
  };
}
