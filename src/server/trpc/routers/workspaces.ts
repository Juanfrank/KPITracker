import { z } from 'zod';
import {
  invocar, protectedProcedure, router,
  workspacesAdministrarProcedure, workspacesCambiarProcedure, workspacesCrearProcedure, workspacesEliminarProcedure
} from '../trpc';

/**
 * Workspaces (Batch AX, fundación SaaS) — `listar` abierta a cualquier
 * sesión (necesaria para poblar el selector "cambiar de workspace" antes de
 * saber si el usuario tiene permiso para usarlo — el gating real de qué se
 * puede HACER con esa lista vive en cada mutación, no en poder verla, mismo
 * criterio que `roles.listar`/`equipos.listar`). Las mutaciones exigen cada
 * una su propio permiso GLOBAL puntual, ver `PoliticaPermisosGlobal.ts`.
 */
export const workspacesRouter = router({
  listar: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.workspaces.listar())),

  crear: workspacesCrearProcedure
    .input(z.object({ nombre: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      invocar(() => ctx.aplicacion.workspaces.guardar({
        id: '', nombre: input.nombre, activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      }))),

  renombrar: workspacesAdministrarProcedure
    .input(z.object({ id: z.string(), nombre: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const actuales = await ctx.aplicacion.workspaces.listar(true);
      const actual = actuales.find((w) => w.id === input.id);
      if (!actual) throw new Error('El workspace no existe.');
      return invocar(() => ctx.aplicacion.workspaces.guardar({ ...actual, nombre: input.nombre }));
    }),

  establecerActivo: workspacesAdministrarProcedure
    .input(z.object({ id: z.string(), activo: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const actuales = await ctx.aplicacion.workspaces.listar(true);
      const actual = actuales.find((w) => w.id === input.id);
      if (!actual) throw new Error('El workspace no existe.');
      return invocar(() => ctx.aplicacion.workspaces.guardar({ ...actual, activo: input.activo }));
    }),

  eliminar: workspacesEliminarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.workspaces.eliminar(input.id))),

  /** Cambia el Workspace en el que "vive" el usuario de la sesión actual — nunca el de otro (ver `ServicioUsuarios.cambiarWorkspaceActual`). */
  cambiarActual: workspacesCambiarProcedure
    .input(z.object({ workspaceId: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.cambiarWorkspaceActual(ctx.usuario.id, input.workspaceId)))
});
