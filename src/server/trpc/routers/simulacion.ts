import { z } from 'zod';
import { HORAS_EXPIRACION_SESION } from '@application/use-cases/ServicioAutenticacion';
import { router, adminProcedure, protectedProcedure, invocar } from '../trpc';
import { COOKIE_SIMULACION } from '../context';

/**
 * "Ver como" (Batch U, U2): un administrador elige un `Usuario` y navega la
 * app viendo exactamente lo que ese usuario vería — mismo tablero, misma
 * Recolección filtrada por sus permisos — sin dejar su propia sesión. Es
 * puramente de lectura: `protectedProcedure` (`trpc.ts`) resuelve el
 * `ContextoPermisos` del usuario simulado para las queries, pero rechaza
 * toda mutación mientras la cookie de simulación esté activa (salvo
 * `terminar`, que la apaga).
 */
export const simulacionRouter = router({
  /** Activa la simulación. Solo un administrador puede iniciarla (y, mientras esté activa, terminarla primero antes de elegir otro usuario). */
  iniciar: adminProcedure
    .input(z.object({ usuarioId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const usuario = await invocar(async () => {
        const encontrado = await ctx.aplicacion.usuarios.obtener(input.usuarioId);
        if (!encontrado || encontrado.eliminado) throw new Error('El usuario elegido no existe o fue eliminado.');
        return encontrado;
      });
      ctx.res.cookie(COOKIE_SIMULACION, usuario.id, {
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: HORAS_EXPIRACION_SESION * 60 * 60 * 1000
      });
      return { id: usuario.id, nombreUsuario: usuario.nombreUsuario, nombreCompleto: usuario.nombreCompleto };
    }),

  /** Apaga la simulación — la única mutación que sigue funcionando mientras está activa (ver `RUTA_TERMINAR_SIMULACION` en `trpc.ts`). */
  terminar: protectedProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(COOKIE_SIMULACION);
    return { ok: true } as const;
  }),

  /** El usuario simulado de la request actual, o `null` fuera de simulación — para el banner persistente del shell. */
  actual: protectedProcedure.query(({ ctx }) => ctx.usuarioSimulado)
});
