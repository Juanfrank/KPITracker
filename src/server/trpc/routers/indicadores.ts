import { z } from 'zod';
import type { GuardarIndicadorInput, MapeoImportacionIndicadores } from '@application/use-cases/ServicioCatalogos';
import { catalogosAdminProcedure, invocar, protectedProcedure, router } from '../trpc';

export const indicadoresRouter = router({
  listar: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['indicadores:listar']())),

  obtener: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['indicadores:obtener'](input))),

  guardar: catalogosAdminProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['indicadores:guardar'](input as GuardarIndicadorInput))),

  eliminar: catalogosAdminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['indicadores:eliminar'](input))),

  /** Sin `catalogosAdminProcedure`: el líder de equipo también puede reasignar responsables dentro de su
   * propio equipo (`equipo.indicadores.asignar`) — el gating real vive en `ServicioIndicadores.reasignarMasivo`. */
  reasignarMasivo: protectedProcedure
    .input(z.object({
      ids: z.array(z.string()), responsable: z.string().nullish(), categoria: z.string().nullish(), equipo: z.string().nullish()
    }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['indicadores:reasignarMasivo'](input))),

  importarExcel: catalogosAdminProcedure
    .input(z.object({ filas: z.array(z.record(z.string())), mapeo: z.any() }))
    .mutation(({ ctx, input }) =>
      invocar(() => ctx.aplicacion.manejadores['indicadores:importarExcel']({ filas: input.filas, mapeo: input.mapeo as MapeoImportacionIndicadores }))
    )
});
