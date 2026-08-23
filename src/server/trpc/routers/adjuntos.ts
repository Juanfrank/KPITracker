import { z } from 'zod';
import { invocar, protectedProcedure, router } from '../trpc';

/**
 * `adjuntos:subir` y `adjuntos:abrir` NO están aquí — se reemplazan por
 * `POST /api/adjuntos` (multipart) y `GET /api/adjuntos/:id/descarga`
 * (streaming), ver `src/server/rest/adjuntos.ts` y la tabla de rutas REST
 * del plan (§5). tRPC solo conserva lo que ya era JSON puro.
 */
export const adjuntosRouter = router({
  listar: protectedProcedure
    .input(z.object({ entidad: z.string(), entidadId: z.string() }))
    .query(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['adjuntos:listar'](input as never))),

  eliminar: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['adjuntos:eliminar'](input)))
});
