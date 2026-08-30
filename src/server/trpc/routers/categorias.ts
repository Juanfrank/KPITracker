import { z } from 'zod';
import type { Categoria } from '@domain/index';
import { categoriasAdminProcedure, invocar, protectedProcedure, router } from '../trpc';
import { objetoConId } from '../schemas';

export const categoriasRouter = router({
  listar: protectedProcedure
    .input(z.object({ incluirEliminados: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['categorias:listar'](input))),

  guardar: categoriasAdminProcedure
    .input(objetoConId)
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['categorias:guardar'](input as Categoria))),

  eliminar: categoriasAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['categorias:eliminar'](input))),

  restaurar: categoriasAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['categorias:restaurar'](input)))
});
