import { z } from 'zod';
import type { Responsable } from '@domain/index';
import { catalogosAdminProcedure, invocar, protectedProcedure, router } from '../trpc';

export const responsablesRouter = router({
  listar: protectedProcedure
    .input(z.object({ incluirEliminados: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['responsables:listar'](input))),

  /** Sin `catalogosAdminProcedure`: el líder de equipo también puede añadir/mover miembros de/hacia
   * su propio equipo (`equipo.miembros.gestionar`) — el gating real vive en `ServicioResponsables.guardar`. */
  guardar: protectedProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['responsables:guardar'](input as Responsable))),

  eliminar: catalogosAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['responsables:eliminar'](input))),

  restaurar: catalogosAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['responsables:restaurar'](input)))
});
