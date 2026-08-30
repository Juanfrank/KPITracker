import { z } from 'zod';
import type { IdentidadSesion } from '@application/use-cases/ServicioAutenticacion';
import { HORAS_EXPIRACION_SESION } from '@application/use-cases/ServicioAutenticacion';
import type { AplicacionServidor } from '../../composicionServidor';
import { router, publicProcedure, protectedProcedure, invocar } from '../trpc';
import { COOKIE_SESION, COOKIE_SIMULACION } from '../context';

/**
 * Identidad + permisos efectivos (Batch T) — misma forma para `login` y
 * `yo`, así el `AuthContext` del renderer solo maneja un tipo. Los permisos
 * son el mismo `ServicioPermisos` que resuelve `protectedProcedure` para el
 * `ContextoPermisos` ambiente; el renderer los usa solo para gating de UI
 * (ocultar botones/secciones), la aplicación real de cada permiso vive en
 * el servidor.
 */
async function conPermisos(aplicacion: AplicacionServidor, identidad: IdentidadSesion) {
  const permisos = await aplicacion.permisos.resolver(identidad.id);
  return {
    ...identidad,
    permisos: {
      generales: [...permisos.permisosGenerales],
      equipoId: permisos.equipoId,
      equipo: [...permisos.permisosEquipo],
      excepcionales: [...permisos.permisosExcepcionales],
      // Batch AX (fundación SaaS): permisos GLOBALES (sobre los Workspaces mismos) — el renderer
      // los usa para el gating de "Workspaces"/"Roles globales" y el selector de cambio de workspace.
      global: [...permisos.permisosGlobales]
    }
  };
}

/**
 * Único router sin equivalente IPC previo (junto con `usuarios`): la app de
 * escritorio no tenía login. `login` pone la cookie de sesión firmada;
 * `logout` la revoca (borra la fila de `sesiones` — ver
 * `ServicioAutenticacion`, no un JWT que expire solo); `yo` es la consulta
 * que el cliente usa para saber si ya hay una sesión activa al cargar la SPA.
 */
export const authRouter = router({
  login: publicProcedure
    .input(z.object({ nombreUsuario: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { sesionId, identidad } = await invocar(() =>
        ctx.aplicacion.autenticacion.iniciarSesion(input.nombreUsuario, input.password)
      );
      ctx.res.cookie(COOKIE_SESION, sesionId, {
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: HORAS_EXPIRACION_SESION * 60 * 60 * 1000
      });
      return conPermisos(ctx.aplicacion, identidad);
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.sesionId) await ctx.aplicacion.autenticacion.cerrarSesion(ctx.sesionId);
    ctx.res.clearCookie(COOKIE_SESION);
    // No debe sobrevivir una simulación activa a un logout — limpia también su cookie.
    ctx.res.clearCookie(COOKIE_SIMULACION);
    return { ok: true } as const;
  }),

  /**
   * Identidad + permisos de la sesión actual, o `null` si no hay ninguna
   * vigente — nunca lanza `UNAUTHORIZED`. U2 ("Ver como"): mientras haya una
   * simulación activa, devuelve la identidad/permisos del usuario SIMULADO,
   * no los del administrador real — así toda la UI (incluido el gating de
   * pantallas de administración) se adapta a lo que ese usuario vería, tal
   * como pide el requisito. El banner "Viendo como" (que sí necesita saber
   * quién es el administrador real detrás) usa `simulacion.actual` aparte.
   */
  yo: publicProcedure.query(({ ctx }) => {
    if (!ctx.usuario) return null;
    return conPermisos(ctx.aplicacion, ctx.usuarioSimulado ?? ctx.usuario);
  })
});
