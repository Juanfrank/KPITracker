import { z } from 'zod';
import { adminProcedure, invocar, router } from '../trpc';

/**
 * Gestión de usuarios (pantalla de administración) — todo el router exige
 * `esAdministrador` (`adminProcedure`). Batch T: `establecerRol` (binario
 * admin/usuario) se reemplaza por setters granulares, uno por cada campo
 * nuevo de `Usuario` — ver `ServicioUsuarios`.
 */
export const usuariosRouter = router({
  listar: adminProcedure.query(({ ctx }) => ctx.aplicacion.usuarios.listar()),

  crear: adminProcedure
    .input(z.object({
      nombreUsuario: z.string(), nombreCompleto: z.string(), password: z.string(),
      esAdministrador: z.boolean().optional(), rolGeneralId: z.string().nullish()
    }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.crear(input))),

  cambiarPassword: adminProcedure
    .input(z.object({ id: z.string(), passwordNueva: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.cambiarPassword(input.id, input.passwordNueva))),

  establecerAdministrador: adminProcedure
    .input(z.object({ id: z.string(), esAdministrador: z.boolean() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerAdministrador(input.id, input.esAdministrador))),

  establecerActivo: adminProcedure
    .input(z.object({ id: z.string(), activo: z.boolean() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerActivo(input.id, input.activo))),

  establecerRolGeneral: adminProcedure
    .input(z.object({ id: z.string(), rolGeneralId: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerRolGeneral(input.id, input.rolGeneralId))),

  establecerEquipo: adminProcedure
    .input(z.object({ id: z.string(), equipoId: z.string().nullable(), rolEquipoId: z.string().nullable() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerEquipo(input.id, input.equipoId, input.rolEquipoId))),

  establecerResponsable: adminProcedure
    .input(z.object({ id: z.string(), responsableId: z.string().nullable() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerResponsable(input.id, input.responsableId))),

  establecerPermisosExcepcionales: adminProcedure
    .input(z.object({ id: z.string(), permisos: z.array(z.string()) }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerPermisosExcepcionales(input.id, input.permisos)))
});
