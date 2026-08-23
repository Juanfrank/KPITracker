import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { protectedProcedure, router } from '../trpc';

const AUTOR = 'Juan Francisco Medina';
const LICENCIA = 'MIT';
const URL_SOPORTE = 'https://github.com/Juanfrank/KPITracker';

function versionApp(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * `sistema:seleccionarArchivo`/`sistema:leerHojaCalculo` NO están aquí —
 * reemplazados por `POST /api/importacion/hoja-calculo` (ver
 * `src/server/rest/importacion.ts`). `sistema:info` era un canal "local"
 * (`CanalLocal`, resuelto fuera de `Aplicacion.manejadores` incluso en
 * Electron) — aquí se recalcula con datos del servidor, sin versiones de
 * Electron/Chrome (no aplican).
 */
export const sistemaRouter = router({
  info: protectedProcedure.query(() => ({
    nombre: 'KPITracker',
    version: versionApp(),
    autor: AUTOR,
    licencia: LICENCIA,
    urlSoporte: URL_SOPORTE,
    electron: 'n/a (servidor web)',
    node: process.versions.node,
    chrome: 'n/a (servidor web)'
  }))
});
