import { z } from 'zod';
import type { Meta } from '@domain/index';
import { catalogosAdminProcedure, invocar, protectedProcedure, router } from '../trpc';

export const metasRouter = router({
  listar: protectedProcedure
    .input(z.object({ indicadorId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['metas:listar'](input))),

  guardar: catalogosAdminProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['metas:guardar'](input as Meta))),

  eliminar: catalogosAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['metas:eliminar'](input)))
});
