import { z } from 'zod';
import type { ConfiguracionGeneral } from '@domain/index';
import { catalogosAdminProcedure, invocar, protectedProcedure, router } from '../trpc';

/**
 * Traslado mecánico de `config:*` (ver `src/shared/ipc.ts`): cada
 * procedimiento delega en `ctx.aplicacion.manejadores[canal]`, que ya hace
 * toda la validación de negocio — el `input` se acepta como opaco (`z.any`)
 * y se castea al tipo exacto del canal, igual que hacía el `payload: unknown`
 * de `ipcMain.handle` en la app de escritorio.
 */
export const configRouter = router({
  obtener: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['config:obtener']())),

  /**
   * `catalogosAdminProcedure`, no `protectedProcedure`: la pantalla "General"
   * vive dentro de la sección "Configuración" del nav (gateada en el cliente
   * por el mismo permiso, ver `permisosNav.ts`) — sin este gate del lado del
   * servidor, ocultar el módulo en el sidebar habría sido solo cosmético.
   */
  guardar: catalogosAdminProcedure
    .input(z.any())
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.manejadores['config:guardar'](input as ConfiguracionGeneral))),

  reglasFechaLimite: protectedProcedure.query(({ ctx }) => invocar(() => ctx.aplicacion.manejadores['config:reglasFechaLimite']()))
});
