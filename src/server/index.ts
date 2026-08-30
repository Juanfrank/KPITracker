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

  const { app, aplicacion, cerrar } = await crearApp({ dataDir, appVersion: process.env.npm_package_version });
  const servidor = createServer(app);

  await new Promise<void>((resolve) => servidor.listen(puerto, resolve));
  console.log(`[KPITracker] Servidor escuchando en http://localhost:${puerto} (datos en "${dataDir}").`);

  // Notificaciones proactivas de vencimiento (correo vía SMTP, ver `ServicioNotificacionesVencimiento`) —
  // reemplaza el `setInterval` cada hora + `Notification` nativa que tenía la app de escritorio
  // Electron (retirada en la Fase 4). Solo corre acá (el proceso real del servidor), nunca en
  // `crearApp()` a secas — así los tests, que llaman `crearApp` directo, no arrastran un timer de
  // fondo ni intentan mandar correos. Corre una vez al arrancar y luego cada `NOTIFICACIONES_
  // INTERVALO_HORAS` (por defecto 24 — a diario alcanza, ver docstring de la clase); un fallo en
  // una corrida (p. ej. el servidor SMTP caído) se registra y NO tumba el proceso.
  const horasIntervalo = Number(process.env.NOTIFICACIONES_INTERVALO_HORAS ?? 24);
  const correrNotificaciones = (): void => {
    aplicacion.notificacionesVencimiento.ejecutar()
      .then(({ enviadas, omitidas }) => {
        if (enviadas > 0 || omitidas > 0) {
          console.log(`[KPITracker] Notificaciones de vencimiento: ${enviadas} enviada(s), ${omitidas} omitida(s).`);
        }
      })
      .catch((error: unknown) => console.error('[KPITracker] Error al procesar notificaciones de vencimiento:', error));
  };
  correrNotificaciones();
  const timerNotificaciones = setInterval(correrNotificaciones, horasIntervalo * 60 * 60 * 1000);

  let apagando = false;
  const apagar = async (): Promise<void> => {
    if (apagando) return;
    apagando = true;
    console.log('[KPITracker] Apagando…');
    clearInterval(timerNotificaciones);
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
