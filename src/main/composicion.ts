import { crearInfraestructura } from '@infrastructure/bootstrap';
import { ArchivoService } from '@infrastructure/soporte/ArchivoService';
import { componerManejadores } from '@composicion/manejadores';
import type { Aplicacion } from '@composicion/manejadores';

export type { Aplicacion } from '@composicion/manejadores';

/**
 * Composition root de Electron: única pieza que conoce `ArchivoService`
 * (diálogos nativos vía `dialog`/`shell`). El grueso del cableado —
 * construir los ~15 servicios de aplicación y el mapa de manejadores por
 * canal— vive en `@composicion/manejadores`, compartido con el composition
 * root del servidor Express (`src/server/composicionServidor.ts`), que le
 * pasa una `Infraestructura` con `ArchivoServiceWeb` en su lugar.
 */
export async function componerAplicacion(dataDir: string, appVersion?: string): Promise<Aplicacion> {
  const infra = await crearInfraestructura(dataDir, { appVersion, crearArchivos: (rutas) => new ArchivoService(rutas) });
  const { manejadores, servicios } = componerManejadores(infra);
  return {
    infra,
    manejadores,
    servicios,
    cerrar: () => infra.cerrar()
  };
}
