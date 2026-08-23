import { z } from 'zod';
import type { DefinicionPeriodicidad } from '@domain/index';
import { invocar, protectedProcedure, router } from '../trpc';

export const periodicidadesRouter = router({
  listar: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['periodicidades:listar']())),

  guardar: protectedProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['periodicidades:guardar'](input as DefinicionPeriodicidad))),

  eliminar: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['periodicidades:eliminar'](input)))
});
