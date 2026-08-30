import { z } from 'zod';
import type { RolGlobal } from '@domain/index';
import { invocar, protectedProcedure, rolesGlobalesAdminProcedure, router } from '../trpc';
import { objetoConId } from '../schemas';

/**
 * Catálogo de roles GLOBALES (Batch AX, fundación SaaS) — mismo criterio de
 * `roles.ts`: lectura abierta a cualquier sesión (la necesita `SeccionUsuarios`
 * para poblar el selector "Rol global"), mutaciones gateadas al permiso
 * puntual `rolesGlobales.administrar` (o `esAdministrador`).
 */
export const rolesGlobalesRouter = router({
  listar: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.rolesGlobales.listar())),

  guardar: rolesGlobalesAdminProcedure
    .input(objetoConId)
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.rolesGlobales.guardar(input as RolGlobal))),

  eliminar: rolesGlobalesAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.rolesGlobales.eliminar(input.id)))
});
