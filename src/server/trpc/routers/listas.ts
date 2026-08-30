import { z } from 'zod';
import type { AliasDesagregacionOrigen, ElementoLista, Lista } from '@domain/index';
import { listasModificarProcedure, invocar, protectedProcedure, router } from '../trpc';
import { objetoConId } from '../schemas';

export const listasRouter = router({
  listar: protectedProcedure
    .input(z.object({ incluirEliminados: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['listas:listar'](input))),

  guardar: listasModificarProcedure
    .input(objetoConId)
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['listas:guardar'](input as Lista))),

  eliminar: listasModificarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['listas:eliminar'](input))),

  restaurar: listasModificarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['listas:restaurar'](input))),

  elementos: protectedProcedure
    .input(z.object({ listaId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['listas:elementos'](input))),

  guardarElemento: listasModificarProcedure
    .input(objetoConId)
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['listas:guardarElemento'](input as ElementoLista))),

  eliminarElemento: listasModificarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['listas:eliminarElemento'](input))),

  aliasOrigen: protectedProcedure
    .input(z.object({ listaId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['listas:aliasOrigen'](input))),

  aliasPorOrigen: protectedProcedure
    .input(z.object({ origenAutomaticoId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['listas:aliasPorOrigen'](input))),

  guardarAliasOrigen: listasModificarProcedure
    .input(objetoConId)
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['listas:guardarAliasOrigen'](input as AliasDesagregacionOrigen))),

  eliminarAliasOrigen: listasModificarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['listas:eliminarAliasOrigen'](input)))
});
