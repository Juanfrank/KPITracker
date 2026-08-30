import { z } from 'zod';
import type { Meta } from '@domain/index';
import { metasModificarProcedure, invocar, protectedProcedure, router } from '../trpc';
import { objetoConId } from '../schemas';

export const metasRouter = router({
  listar: protectedProcedure
    .input(z.object({ indicadorId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['metas:listar'](input))),

  guardar: metasModificarProcedure
    .input(objetoConId)
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['metas:guardar'](input as Meta))),

  eliminar: metasModificarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['metas:eliminar'](input)))
});
