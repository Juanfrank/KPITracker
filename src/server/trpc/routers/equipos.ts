import { z } from 'zod';
import type { Equipo } from '@domain/index';
import { catalogosAdminProcedure, invocar, protectedProcedure, router } from '../trpc';

/**
 * Alta/edición/borrado del EQUIPO en sí (no de sus miembros) exige
 * `catalogos.administrar` — el líder de un equipo puede añadir/quitar
 * miembros (`responsables:guardar`, gateado dentro del propio servicio) y
 * asignarles indicadores, pero no crear/renombrar/borrar equipos.
 */
export const equiposRouter = router({
  listar: protectedProcedure
    .input(z.object({ incluirEliminados: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['equipos:listar'](input))),

  guardar: catalogosAdminProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['equipos:guardar'](input as Equipo))),

  eliminar: catalogosAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['equipos:eliminar'](input))),

  restaurar: catalogosAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['equipos:restaurar'](input)))
});
