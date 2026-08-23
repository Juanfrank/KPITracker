import { z } from 'zod';
import type { Responsable } from '@domain/index';
import { invocar, protectedProcedure, router } from '../trpc';

export const responsablesRouter = router({
  listar: protectedProcedure
    .input(z.object({ incluirEliminados: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['responsables:listar'](input))),

  guardar: protectedProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['responsables:guardar'](input as Responsable))),

  eliminar: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['responsables:eliminar'](input))),

  restaurar: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['responsables:restaurar'](input)))
});
