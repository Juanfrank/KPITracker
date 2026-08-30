import { z } from 'zod';
import type { OrigenAutomatico } from '@domain/index';
import { puedeAdministrarOrigenes } from '@domain/index';
import { permisosActuales } from '@application/use-cases/contextoUsuario';
import { origenesAdminProcedure, invocar, protectedProcedure, router } from '../trpc';

/**
 * Hallazgo del audit de seguridad (HIGH-2): `listar` la usan pantallas como
 * Indicadores/Listas solo para poblar un dropdown (nombre/tipo), pero
 * cualquier sesión válida podía llamarla y recibía `configuracion` completa
 * — incluida la contraseña en texto plano de la fuente externa (SQL Server/
 * Power BI/XMLA) — sin necesitar el permiso `origenes.administrar` que sí
 * gatea `guardar`/`eliminar`/`probar`. Se redacta acá, no en el servicio
 * genérico (`ServicioCatalogoGenerico`, sin noción de "campos secretos"):
 * quien SÍ administra orígenes sigue viendo la configuración completa para
 * poder editarla.
 */
function sinCredenciales(origen: OrigenAutomatico): OrigenAutomatico {
  if (!('contrasena' in origen.configuracion)) return origen;
  const configuracion = { ...origen.configuracion };
  delete configuracion.contrasena;
  return { ...origen, configuracion };
}

export const origenesRouter = router({
  listar: protectedProcedure
    .input(z.object({ incluirEliminados: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const origenes = await invocar(() => ctx.aplicacion.manejadores['origenes:listar'](input)) as OrigenAutomatico[];
      return puedeAdministrarOrigenes(permisosActuales()) ? origenes : origenes.map(sinCredenciales);
    }),

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
