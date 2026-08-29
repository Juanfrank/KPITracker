import { z } from 'zod';
import type { ConfiguracionMedicionCategoria } from '@domain/index';
import { categoriasAdminProcedure, invocar, protectedProcedure, router } from '../trpc';

/** Medición por categoría/subcategoría (Batch Y) — mismo gating que Categorías (`puedeAdministrarCategorias`). */
export const medicionCategoriaRouter = router({
  obtener: protectedProcedure
    .input(z.object({ categoriaId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['medicionCategoria:obtener'](input))),

  guardar: categoriasAdminProcedure
    .input(z.any())
    .mutation(({ ctx, input }) =>
      invocar(() => ctx.aplicacion.manejadores['medicionCategoria:guardar'](input as ConfiguracionMedicionCategoria))
    ),

  calcular: protectedProcedure
    .input(z.object({ categoriaId: z.string(), periodoId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['medicionCategoria:calcular'](input)))
});
