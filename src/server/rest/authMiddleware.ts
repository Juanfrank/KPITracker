import type { NextFunction, Request, Response } from 'express';
import type { ContextoPermisos } from '@domain/index';
import type { IdentidadSesion } from '@application/use-cases/ServicioAutenticacion';
import { conPermisos, conUsuario, permisosActuales } from '@application/use-cases/contextoUsuario';
import { COOKIE_SESION } from '../trpc/context';
import type { AplicacionServidor } from '../composicionServidor';

export interface RequestConUsuario extends Request {
  usuario: IdentidadSesion;
}

/**
 * Equivalente REST de `protectedProcedure` (ver `trpc.ts`): valida la misma
 * cookie firmada de sesión y, si es válida, cuelga `req.usuario`, establece
 * la identidad ambiente (`conUsuario`) para que la auditoría de lo que haga
 * el handler downstream quede atribuida al usuario correcto, Y (Batch X, X7)
 * resuelve y planta el `ContextoPermisos` ambiente (`conPermisos`) — antes
 * de este cambio, cualquier `Servicio*` invocado desde una ruta REST veía
 * `permisosActuales()` resuelto a "sin restricción" (fuera de toda llamada
 * `conPermisos`, ver `contextoUsuario.ts`), por no pasar nunca por
 * `protectedProcedure`. Necesario para que `puedeImportarExportarRespaldo`
 * (usado por `requierePermiso`, más abajo) tenga algo real que evaluar.
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
      const permisos = await aplicacion.permisos.resolver(usuario.id);
      await conPermisos(permisos, () => conUsuario(usuario.id, async () => next()));
    })().catch(next);
  };
}

/**
 * Middleware de permiso puntual para rutas REST (Batch X, X7) — mismo
 * espíritu que `procedureConPermiso` en `trpc.ts`, montado DESPUÉS de
 * `requireAuth` (que ya pobló `permisosActuales()`).
 */
export function requierePermiso(chequeo: (ctx: ContextoPermisos) => boolean, mensaje: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!chequeo(permisosActuales())) {
      res.status(403).json({ error: mensaje });
      return;
    }
    next();
  };
}
