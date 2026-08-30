import { z } from 'zod';
import type { DefinicionPeriodicidad } from '@domain/index';
import { catalogosAdminProcedure, invocar, protectedProcedure, router } from '../trpc';
import { objetoConId } from '../schemas';

export const periodicidadesRouter = router({
  listar: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['periodicidades:listar']())),

  guardar: catalogosAdminProcedure
    .input(objetoConId)
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['periodicidades:guardar'](input as DefinicionPeriodicidad))),

  eliminar: catalogosAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['periodicidades:eliminar'](input)))
});
