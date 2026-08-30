import { z } from 'zod';
import type { CorteMedicion } from '@domain/index';
import { metasModificarProcedure, invocar, protectedProcedure, router } from '../trpc';
import { objetoConId } from '../schemas';

/**
 * "Cortes de medición" (Batch Y) — mismo gating que Metas
 * (`metasModificarProcedure`, ver `puedeModificarMetas`): es parte de
 * Configuración de Metas, no un catálogo aparte.
 */
export const cortesMedicionRouter = router({
  listar: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['cortesMedicion:listar']())),

  guardar: metasModificarProcedure
    .input(objetoConId)
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['cortesMedicion:guardar'](input as CorteMedicion))),

  eliminar: metasModificarProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['cortesMedicion:eliminar'](input))),

  calcular: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['cortesMedicion:calcular'](input)))
});
