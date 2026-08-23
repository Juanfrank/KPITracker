import { z } from 'zod';
import { invocar, protectedProcedure, router } from '../trpc';

export const seguimientoRouter = router({
  tablero: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['seguimiento:tablero']())),

  detalle: protectedProcedure
    .input(z.object({ indicadorId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['seguimiento:detalle'](input))),

  historico: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['seguimiento:historico']()))
});
