import { z } from 'zod';
import { adminProcedure, catalogosAdminProcedure, invocar, protectedProcedure, rolesAdminProcedure, router } from '../trpc';

/**
 * Gestión de usuarios (pantalla de administración). Batch U unifica Usuario
 * con el antiguo catálogo Responsable — un usuario ES la persona asignable
 * como responsable de un indicador, por eso `listar` (necesario para poblar
 * el selector de responsables en Indicadores) y `establecerEquipo`
 * (que un líder de equipo puede usar para mover gente de/hacia su propio
 * equipo, gating dentro de `ServicioUsuarios.establecerEquipo`) NO son
 * `adminProcedure`. Batch X (X7) abre además `establecerRolGeneral` a
 * `roles.administrar` (`rolesAdminProcedure`). Todo lo demás (crear cuentas,
 * contraseñas, el flag `esAdministrador`, permisos excepcionales) sigue
 * siendo exclusivo del administrador — `roles.administrar` nunca alcanza
 * para eso, ver `puedeAdministrarRoles` en `PoliticaPermisos.ts`.
 */
export const usuariosRouter = router({
  listar: protectedProcedure
    .input(z.object({ incluirEliminados: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => ctx.aplicacion.usuarios.listar(input?.incluirEliminados)),

  crear: adminProcedure
    .input(z.object({
      nombreUsuario: z.string(), nombreCompleto: z.string(), correo: z.string().nullish(), password: z.string(),
      esAdministrador: z.boolean().optional(), rolGeneralId: z.string().nullish()
    }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.crear(input))),

  guardarDatos: protectedProcedure
    .input(z.object({ id: z.string(), nombreCompleto: z.string(), correo: z.string().nullish() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.guardarDatos(input.id, input))),

  cambiarPassword: adminProcedure
    .input(z.object({ id: z.string(), passwordNueva: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.cambiarPassword(input.id, input.passwordNueva))),

  establecerAdministrador: adminProcedure
    .input(z.object({ id: z.string(), esAdministrador: z.boolean() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerAdministrador(input.id, input.esAdministrador))),

  establecerActivo: adminProcedure
    .input(z.object({ id: z.string(), activo: z.boolean() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerActivo(input.id, input.activo))),

  /** `rolesAdminProcedure`, no `adminProcedure`: Batch X (X7) permite delegar la asignación de roles
   * generales vía `roles.administrar`, sin dar acceso administrador completo — ver `roles.ts`. */
  establecerRolGeneral: rolesAdminProcedure
    .input(z.object({ id: z.string(), rolGeneralId: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerRolGeneral(input.id, input.rolGeneralId))),

  /** Sin `adminProcedure`: el líder de equipo también puede añadir/mover miembros de/hacia
   * su propio equipo (`equipo.miembros.gestionar`) — el gating real vive en `ServicioUsuarios.establecerEquipo`. */
  establecerEquipo: protectedProcedure
    .input(z.object({ id: z.string(), equipoId: z.string().nullable(), rolEquipoId: z.string().nullable() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerEquipo(input.id, input.equipoId, input.rolEquipoId))),

  establecerPermisosExcepcionales: adminProcedure
    .input(z.object({ id: z.string(), permisos: z.array(z.string()) }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerPermisosExcepcionales(input.id, input.permisos))),

  eliminar: catalogosAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.eliminar(input.id))),

  restaurar: catalogosAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.restaurar(input.id))),

  /** Credenciales autogeneradas (migración de unificación, o import de un usuario nuevo desde un respaldo) — se consumen (leen y borran) una sola vez. */
  credencialesPendientes: adminProcedure.query(({ ctx }) => ctx.aplicacion.usuarios.credencialesPendientes())
});
