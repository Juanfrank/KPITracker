import { z } from 'zod';
import { HORAS_EXPIRACION_SESION } from '@application/use-cases/ServicioAutenticacion';
import { router, publicProcedure, protectedProcedure, invocar } from '../trpc';
import { COOKIE_SESION } from '../context';

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
      return identidad;
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.sesionId) await ctx.aplicacion.autenticacion.cerrarSesion(ctx.sesionId);
    ctx.res.clearCookie(COOKIE_SESION);
    return { ok: true } as const;
  }),

  /** Identidad de la sesión actual, o `null` si no hay ninguna vigente — nunca lanza `UNAUTHORIZED`. */
  yo: publicProcedure.query(({ ctx }) => ctx.usuario)
});
