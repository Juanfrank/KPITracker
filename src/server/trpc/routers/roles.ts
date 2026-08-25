import { z } from 'zod';
import type { Rol } from '@domain/index';
import { invocar, protectedProcedure, rolesAdminProcedure, router } from '../trpc';

/**
 * Catálogo de roles (Batch T) — lectura abierta a cualquier sesión (la
 * necesita `SeccionUsuarios` para poblar los selectores de rol general/de
 * equipo). Mutaciones exigían `esAdministrador`; Batch X (X7) añade el
 * permiso puntual `roles.administrar` como alternativa (`rolesAdminProcedure`,
 * ver `puedeAdministrarRoles` en `PoliticaPermisos.ts`) — deliberadamente NO
 * cubierto por `catalogos.administrar`, más sensible que el resto de los
 * catálogos porque puede conceder otros permisos.
 */
export const rolesRouter = router({
  listar: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['roles:listar']())),

  guardar: rolesAdminProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['roles:guardar'](input as Rol))),

  eliminar: rolesAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['roles:eliminar'](input)))
});
