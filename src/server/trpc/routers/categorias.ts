import { z } from 'zod';
import type { Categoria } from '@domain/index';
import { catalogosAdminProcedure, invocar, protectedProcedure, router } from '../trpc';

export const categoriasRouter = router({
  listar: protectedProcedure
    .input(z.object({ incluirEliminados: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['categorias:listar'](input))),

  guardar: catalogosAdminProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['categorias:guardar'](input as Categoria))),

  eliminar: catalogosAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['categorias:eliminar'](input))),

  restaurar: catalogosAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['categorias:restaurar'](input)))
});
