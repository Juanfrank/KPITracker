import { z } from 'zod';
import { invocar, protectedProcedure, router } from '../trpc';

export const recoleccionRouter = router({
  periodos: protectedProcedure
    .input(z.object({ indicadorId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['recoleccion:periodos'](input))),

  captura: protectedProcedure
    .input(z.object({ indicadorId: z.string(), periodoId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['recoleccion:captura'](input))),

  guardarCelda: protectedProcedure
    .input(
      z.object({
        indicadorId: z.string(),
        periodoId: z.string(),
        claveDesagregacion: z.string(),
        valorCrudo: z.string(),
        observacion: z.string().nullish()
      })
    )
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['recoleccion:guardarCelda'](input))),

  fechaCorte: protectedProcedure
    .input(z.object({ indicadorId: z.string(), periodoId: z.string(), fechaCorte: z.string().nullable() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['recoleccion:fechaCorte'](input))),

  comentario: protectedProcedure
    .input(z.object({ indicadorId: z.string(), periodoId: z.string(), comentario: z.string().nullable() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['recoleccion:comentario'](input))),

  exclusion: protectedProcedure
    .input(z.object({ indicadorId: z.string(), periodoId: z.string(), listaId: z.string(), excluir: z.boolean() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['recoleccion:exclusion'](input))),

  historial: protectedProcedure
    .input(z.object({ indicadorId: z.string(), periodoId: z.string(), claveDesagregacion: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['recoleccion:historial'](input))),

  restaurarVersion: protectedProcedure
    .input(z.object({ indicadorId: z.string(), periodoId: z.string(), claveDesagregacion: z.string(), version: z.number() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['recoleccion:restaurarVersion'](input))),

  /** Ejecuta el script del origen configurado (I/O externa) y escribe celdas — deliberadamente mutation, no query. */
  obtenerAutomatico: protectedProcedure
    .input(z.object({ indicadorId: z.string(), periodoId: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['recoleccion:obtenerAutomatico'](input))),

  /** Batch T: capa de aprobación post-registro — el gating (`resultados.validar.*`) vive en `ServicioRecoleccion`. */
  validar: protectedProcedure
    .input(z.object({ indicadorId: z.string(), periodoId: z.string(), claveDesagregacion: z.string(), comentario: z.string().nullish() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['recoleccion:validar'](input))),

  rechazar: protectedProcedure
    .input(z.object({ indicadorId: z.string(), periodoId: z.string(), claveDesagregacion: z.string(), comentario: z.string().nullish() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['recoleccion:rechazar'](input)))
});
