import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { componerAplicacion } from './composicion';
import type { Aplicacion } from './composicion';
import { NOMBRES_CANALES } from '@shared/ipc';
import type { RespuestaIpc } from '@shared/ipc';
import { ValidacionError } from '@domain/index';

let aplicacion: Aplicacion | null = null;

/** El directorio de datos puede fijarse por variable de entorno (pruebas E2E). */
function directorioDatos(): string {
  return process.env.KPITRACKER_DATA_DIR ?? join(app.getPath('userData'), 'Data');
}

function registrarIpc(aplicacionActual: Aplicacion): void {
  for (const canal of NOMBRES_CANALES) {
    ipcMain.handle(canal, async (_evento, payload: unknown): Promise<RespuestaIpc<unknown>> => {
      try {
        const manejador = aplicacionActual.manejadores[canal] as (p: unknown) => Promise<unknown>;
        const datos = await manejador(payload);
        return { ok: true, datos };
      } catch (error) {
        if (error instanceof ValidacionError) {
          return { ok: false, error: error.message, detalles: error.detalles };
        }
        const mensaje = error instanceof Error ? error.message : String(error);
        console.error(`Error en canal ${canal}:`, error);
        return { ok: false, error: mensaje };
      }
    });
  }
}

async function crearVentana(): Promise<void> {
  const ventana = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'KPITracker',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  ventana.on('ready-to-show', () => ventana.show());
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await ventana.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await ventana.loadFile(join(import.meta.dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  aplicacion = await componerAplicacion(directorioDatos());
  registrarIpc(aplicacion);
  await crearVentana();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Garantiza que todo lo pendiente quede materializado en Parquet al salir.
app.on('before-quit', (evento) => {
  if (aplicacion) {
    evento.preventDefault();
    const actual = aplicacion;
    aplicacion = null;
    void actual.cerrar().finally(() => app.quit());
  }
});
