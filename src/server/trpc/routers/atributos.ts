import { z } from 'zod';
import type { Atributo } from '@domain/index';
import type { ValorAtributoEntidad } from '@application/ports/index';
import { atributosModificarProcedure, invocar, protectedProcedure, router } from '../trpc';

export const atributosRouter = router({
  listar: protectedProcedure
    .input(z.object({ entidad: z.string().optional(), incluirEliminados: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['atributos:listar'](input))),

  guardar: atributosModificarProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['atributos:guardar'](input as Atributo))),

  eliminar: atributosModificarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['atributos:eliminar'](input))),

  restaurar: atributosModificarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['atributos:restaurar'](input))),

  valores: protectedProcedure
    .input(z.object({ entidadTipo: z.string(), entidadId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['atributos:valores'](input))),

  guardarValor: atributosModificarProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['atributos:guardarValor'](input as ValorAtributoEntidad)))
});
