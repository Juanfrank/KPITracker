import { invocar, protectedProcedure, router } from '../trpc';

export const tiposRouter = router({
  listar: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['tipos:listar']()))
});
