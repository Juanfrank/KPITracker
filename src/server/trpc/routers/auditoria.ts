import { z } from 'zod';
import { invocar, protectedProcedure, router } from '../trpc';

export const auditoriaRouter = router({
  consultar: protectedProcedure
    .input(z.object({ entidad: z.string().optional(), entidadId: z.string().optional(), desde: z.string().optional(), hasta: z.string().optional(), limite: z.number().optional() }).default({}))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['auditoria:consultar'](input)))
});
