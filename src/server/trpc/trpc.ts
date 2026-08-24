import { initTRPC, TRPCError } from '@trpc/server';
import { EntidadNoEncontradaError, NoImplementadoError, ValidacionError, puedeAdministrarCatalogos } from '@domain/index';
import { conPermisos, conUsuario, permisosActuales } from '@application/use-cases/contextoUsuario';
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
 * Rutas exentas del bloqueo de mutaciones en modo simulación (U2): sin esta
 * excepción, un administrador simulando a otro usuario no podría llamar la
 * mutación que le permite SALIR de la simulación (quedaría atrapado en modo
 * lectura hasta borrar la cookie a mano) ni cerrar sesión por completo.
 */
const RUTAS_EXENTAS_DE_SIMULACION = new Set(['simulacion.terminar', 'auth.logout']);

/**
 * Exige una sesión válida (`ctx.usuario` no nulo) y establece esa identidad
 * como "usuario ambiente" (`conUsuario`, ver `contextoUsuario.ts`) para toda
 * la auditoría que dispare el resolver — el mismo mecanismo que hoy usa la
 * app de escritorio con el valor implícito `'local'`.
 *
 * U2 ("Ver como"): si hay una simulación activa (`ctx.usuarioSimulado`, ya
 * validado en `context.ts` como admin-only), el `ContextoPermisos` ambiente
 * se resuelve para el usuario SIMULADO — así las queries (tablero, listar,
 * etc.) devuelven exactamente lo que ese usuario vería — pero la identidad
 * de auditoría (`conUsuario`) sigue siendo la del administrador real: nunca
 * se le atribuye una acción a alguien que no la realizó. Toda mutación se
 * rechaza mientras la simulación esté activa (salvo la que la termina),
 * dejando la simulación puramente de lectura.
 */
export const protectedProcedure = t.procedure.use(async ({ ctx, next, type, path }) => {
  if (!ctx.usuario) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Se requiere iniciar sesión.' });
  const usuario = ctx.usuario;
  if (ctx.usuarioSimulado && type === 'mutation' && !RUTAS_EXENTAS_DE_SIMULACION.has(path)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Modo simulación ("Ver como"): solo lectura. Salga de la simulación para modificar datos.' });
  }
  // Batch T: además de la identidad (conUsuario, para auditoría), resuelve y planta el
  // ContextoPermisos ambiente que consumen los Servicio* para filtrar/gatear por permiso.
  const permisos = await ctx.aplicacion.permisos.resolver(ctx.usuarioSimulado?.id ?? usuario.id);
  return conPermisos(permisos, () => conUsuario(usuario.id, () => next({ ctx: { ...ctx, usuario } })));
});

/** Además de sesión válida, exige `esAdministrador` — gestión de usuarios/roles y pantallas de administración. */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.usuario.esAdministrador) throw new TRPCError({ code: 'FORBIDDEN', message: 'Requiere rol de administrador.' });
  return next({ ctx });
});

/**
 * Exige el permiso `catalogos.administrar` (admin, o el permiso general u
 * excepcional, ver `puedeAdministrarCatalogos`) — las mutaciones de las
 * pantallas de Configuración (indicadores, categorías, listas, atributos,
 * reglas, periodicidades, orígenes automáticos). Las lecturas (`listar`) se
 * mantienen en `protectedProcedure`: las necesita toda la app para poblar
 * selectores. `equipos`/`responsables` NO usan esta procedure para
 * `guardar` — ahí el líder de equipo tiene un permiso más acotado
 * (`equipo.miembros.gestionar`), gateado dentro del propio servicio
 * (`ServicioResponsables.guardar`), no a nivel de router.
 */
export const catalogosAdminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!puedeAdministrarCatalogos(permisosActuales())) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Requiere permiso para administrar la configuración.' });
  }
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
