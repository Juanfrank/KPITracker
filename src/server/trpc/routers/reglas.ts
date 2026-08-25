import { z } from 'zod';
import type { ReglaNegocio } from '@domain/index';
import { reglasModificarProcedure, invocar, protectedProcedure, router } from '../trpc';

export const reglasRouter = router({
  listar: protectedProcedure
    .input(z.object({ entidad: z.string().optional(), incluirEliminados: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['reglas:listar'](input))),

  guardar: reglasModificarProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['reglas:guardar'](input as ReglaNegocio))),

  eliminar: reglasModificarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['reglas:eliminar'](input))),

  restaurar: reglasModificarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['reglas:restaurar'](input)))
});
