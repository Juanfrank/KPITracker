import { invocar, protectedProcedure, router } from '../trpc';

export const exportacionRouter = router({
  regenerar: protectedProcedure.mutation(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['exportacion:regenerar']())),
  ruta: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['exportacion:ruta']()))
});
