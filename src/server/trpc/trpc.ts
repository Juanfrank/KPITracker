import { initTRPC, TRPCError } from '@trpc/server';
import { EntidadNoEncontradaError, NoImplementadoError, ValidacionError } from '@domain/index';
import { conUsuario } from '@application/use-cases/contextoUsuario';
import type { Context } from './context';

/**
 * Instancia raíz de tRPC. El `errorFormatter` preserva, sobre el cable, el
 * mismo sobre `{ error, detalles }` que ya usaba `RespuestaIpc` (ver
 * `src/shared/ipc.ts`) — el cliente web lee `error.data.detalles` donde
 * antes leía `error.detalles` del IPC.
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    const detalles = error.cause instanceof ValidacionError ? error.cause.detalles : undefined;
    return { ...shape, data: { ...shape.data, detalles } };
  }
});

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

/**
 * Exige una sesión válida (`ctx.usuario` no nulo) y establece esa identidad
 * como "usuario ambiente" (`conUsuario`, ver `contextoUsuario.ts`) para toda
 * la auditoría que dispare el resolver — el mismo mecanismo que hoy usa la
 * app de escritorio con el valor implícito `'local'`.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.usuario) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Se requiere iniciar sesión.' });
  const usuario = ctx.usuario;
  return conUsuario(usuario.id, () => next({ ctx: { ...ctx, usuario } }));
});

/** Además de sesión válida, exige `rol === 'admin'` — gestión de usuarios y pantallas de administración. */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.usuario.rol !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Requiere rol de administrador.' });
  return next({ ctx });
});

/**
 * Ejecuta `fn` (normalmente una llamada a `ctx.aplicacion.manejadores[...]`)
 * traduciendo los errores de dominio a `TRPCError` con el código HTTP más
 * afín — el mismo mapeo que antes hacía `registrarIpc` en `src/main/index.ts`
 * al construir `RespuestaIpc`. Cualquier otro error (técnico, inesperado) se
 * deja pasar tal cual: tRPC lo reporta como `INTERNAL_SERVER_ERROR`.
 */
export function invocar<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    if (error instanceof ValidacionError) throw new TRPCError({ code: 'BAD_REQUEST', message: error.message, cause: error });
    if (error instanceof EntidadNoEncontradaError) throw new TRPCError({ code: 'NOT_FOUND', message: error.message, cause: error });
    if (error instanceof NoImplementadoError) throw new TRPCError({ code: 'NOT_IMPLEMENTED', message: error.message, cause: error });
    throw error;
  });
}
