import { createServer } from 'node:http';
import { crearApp } from './app';

/**
 * Punto de entrada del proceso del servidor (`node src/server/index.ts` vía
 * `tsx`, o compilado — ver `package.json#scripts`). Un único proceso, una
 * única `AplicacionServidor` para todas las requests (espacio de trabajo
 * compartido, ver plan §0) — nada de esto crea infraestructura por request.
 */
async function main(): Promise<void> {
  const dataDir = process.env.KPITRACKER_DATA_DIR ?? './data';
  const puerto = Number(process.env.PORT ?? 3000);

  const { app, cerrar } = await crearApp({ dataDir, appVersion: process.env.npm_package_version });
  const servidor = createServer(app);

  await new Promise<void>((resolve) => servidor.listen(puerto, resolve));
  console.log(`[KPITracker] Servidor escuchando en http://localhost:${puerto} (datos en "${dataDir}").`);

  let apagando = false;
  const apagar = async (): Promise<void> => {
    if (apagando) return;
    apagando = true;
    console.log('[KPITracker] Apagando…');
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
    await cerrar();
    process.exit(0);
  };
  process.on('SIGINT', () => void apagar());
  process.on('SIGTERM', () => void apagar());
}

main().catch((error: unknown) => {
  console.error('[KPITracker] Error fatal al iniciar el servidor:', error);
  process.exit(1);
});
