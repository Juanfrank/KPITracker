import { z } from 'zod';
import type { ConfiguracionMedicionEquipo } from '@domain/index';
import { equiposAdminProcedure, invocar, protectedProcedure, router } from '../trpc';
import { objetoConEquipoId } from '../schemas';

/** Medición por equipo/sub-equipo (mismo gating que Equipos: `puedeAdministrarEquipos`). */
export const medicionEquipoRouter = router({
  obtener: protectedProcedure
    .input(z.object({ equipoId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['medicionEquipo:obtener'](input))),

  guardar: equiposAdminProcedure
    .input(objetoConEquipoId)
    .mutation(({ ctx, input }) =>
      invocar(() => ctx.aplicacion.manejadores['medicionEquipo:guardar'](input as ConfiguracionMedicionEquipo))
    )
});
