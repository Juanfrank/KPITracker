import { z } from 'zod';
import type { AutomatizacionIndicador, ParametroDinamico } from '@domain/index';
import { invocar, protectedProcedure, router } from '../trpc';

export const automatizacionRouter = router({
  obtener: protectedProcedure
    .input(z.object({ indicadorId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['automatizacion:obtener'](input))),

  guardar: protectedProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['automatizacion:guardar'](input as AutomatizacionIndicador))),

  eliminar: protectedProcedure
    .input(z.object({ indicadorId: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['automatizacion:eliminar'](input))),

  ejecutarPrueba: protectedProcedure
    .input(
      z.object({
        indicadorId: z.string(),
        periodoId: z.string(),
        origenAutomaticoId: z.string(),
        parametrosDinamicos: z.array(z.any()),
        script: z.string()
      })
    )
    .mutation(({ ctx, input }) =>
      invocar(() => ctx.aplicacion.manejadores['automatizacion:ejecutarPrueba']({ ...input, parametrosDinamicos: input.parametrosDinamicos as ParametroDinamico[] }))
    ),

  validarColumna: protectedProcedure
    .input(z.object({ listaId: z.string(), valoresUnicos: z.array(z.string()) }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['automatizacion:validarColumna'](input))),

  agregarElementosFaltantes: protectedProcedure
    .input(z.object({ listaId: z.string(), nombres: z.array(z.string()) }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['automatizacion:agregarElementosFaltantes'](input)))
});
