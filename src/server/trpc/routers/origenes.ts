import { z } from 'zod';
import type { OrigenAutomatico } from '@domain/index';
import { origenesAdminProcedure, invocar, protectedProcedure, router } from '../trpc';

export const origenesRouter = router({
  listar: protectedProcedure
    .input(z.object({ incluirEliminados: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['origenes:listar'](input))),

  guardar: origenesAdminProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['origenes:guardar'](input as OrigenAutomatico))),

  eliminar: origenesAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['origenes:eliminar'](input))),

  restaurar: origenesAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['origenes:restaurar'](input))),

  /** No muta datos propios, pero abre conexión de red saliente — se trata como mutation, no query cacheable. */
  probar: origenesAdminProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['origenes:probar'](input as OrigenAutomatico))),

  probarCodigo: origenesAdminProcedure
    .input(z.object({ origen: z.any(), script: z.string() }))
    .mutation(({ ctx, input }) =>
      invocar(() => ctx.aplicacion.manejadores['origenes:probarCodigo']({ origen: input.origen as OrigenAutomatico, script: input.script }))
    )
});
