import { z } from 'zod';
import type { Rol } from '@domain/index';
import { adminProcedure, invocar, protectedProcedure, router } from '../trpc';

/**
 * Catálogo de roles (Batch T) — lectura abierta a cualquier sesión (la
 * necesita `SeccionUsuarios` para poblar los selectores de rol general/de
 * equipo), mutaciones exigen `esAdministrador` (mismo criterio que
 * `usuariosRouter`: solo el administrador gestiona el andamiaje de
 * roles/permisos, no un permiso más del catálogo — ver el docstring de
 * `Usuario.esAdministrador`).
 */
export const rolesRouter = router({
  listar: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['roles:listar']())),

  guardar: adminProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['roles:guardar'](input as Rol))),

  eliminar: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['roles:eliminar'](input)))
});
