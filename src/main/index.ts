import { app, BrowserWindow, ipcMain, Notification, shell } from 'electron';
import { join } from 'node:path';
import { componerAplicacion } from './composicion';
import type { Aplicacion } from './composicion';
import { GestorPerfiles, directorioBasePerfiles, rutaRegistroPerfiles } from './perfiles/GestorPerfiles';
import { NOMBRES_CANALES } from '@shared/ipc';
import type { CanalesIpc, NombreCanal, RespuestaIpc } from '@shared/ipc';
import { EntidadNoEncontradaError, ValidacionError } from '@domain/index';
import { GeneradorUuid, RelojSistema } from '@infrastructure/soporte/servicios';
import { indicadoresQueRequierenNotificacion } from '@application/notificaciones/DetectorVencimientos';

let aplicacion: Aplicacion | null = null;
let temporizadorNotificaciones: ReturnType<typeof setInterval> | null = null;
const yaNotificados = new Set<string>();

const gestorPerfiles = new GestorPerfiles(
  rutaRegistroPerfiles(), directorioBasePerfiles(), directorioDatos(), new GeneradorUuid(), new RelojSistema()
);

const INTERVALO_NOTIFICACIONES_MS = 60 * 60 * 1000; // cada hora

const AUTOR = 'Juan Francisco Medina';
const LICENCIA = 'MIT';
const URL_SOPORTE = 'https://github.com/Juanfrank/KPITracker';

/**
 * Manejadores que no dependen de una `Aplicacion` concreta (no son
 * por-perfil): metadatos estáticos de la app, o —más adelante— la gestión
 * de perfiles, que se ejecuta *entre* instancias de `Aplicacion`. Se
 * consultan antes que `aplicacion.manejadores` en `registrarIpc`.
 */
type ManejadoresLocales = { [C in NombreCanal]?: (payload: CanalesIpc[C]['req']) => Promise<CanalesIpc[C]['res']> };
const manejadoresLocales: ManejadoresLocales = {
  'sistema:info': async () => ({
    nombre: app.getName(),
    version: app.getVersion(),
    autor: AUTOR,
    licencia: LICENCIA,
    urlSoporte: URL_SOPORTE,
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  }),

  'perfiles:listar': () => gestorPerfiles.listar(),
  'perfiles:crear': ({ nombre }) => gestorPerfiles.crear(nombre),
  'perfiles:renombrar': ({ id, nombre }) => gestorPerfiles.renombrar(id, nombre),
  'perfiles:eliminar': ({ id, borrarArchivos }) => gestorPerfiles.eliminar(id, borrarArchivos),
  'perfiles:cambiar': async ({ id }) => {
    const { perfiles, activoId } = await gestorPerfiles.listar();
    const anterior = perfiles.find((p) => p.id === activoId);
    const nuevo = perfiles.find((p) => p.id === id);
    if (!nuevo) throw new EntidadNoEncontradaError('Perfil', id);
    if (!anterior) throw new ValidacionError('No se encontró el perfil activo actual.');
    // Solo se persiste el nuevo activo si el swap tuvo éxito — si `nuevo.ruta`
    // no abre, `cambiarPerfil` reabre `anterior.ruta` y el registro sigue
    // apuntando al perfil que sí funciona.
    await cambiarPerfil(nuevo.ruta, anterior.ruta);
    await gestorPerfiles.marcarActivo(id);
    return { activoId: id };
  }
};

/**
 * Revisa el tablero de seguimiento y dispara notificaciones del sistema
 * operativo para indicadores vencidos o próximos a vencer. Deduplica en
 * memoria por sesión (una vez notificado, no se repite hasta reiniciar la
 * app) — no persiste estado en disco.
 */
async function revisarVencimientos(aplicacionActual: Aplicacion): Promise<void> {
  if (!Notification.isSupported()) return;
  const tablero = await aplicacionActual.manejadores['seguimiento:tablero'](undefined);
  const hoy = new Date().toISOString().slice(0, 10);
  const pendientes = indicadoresQueRequierenNotificacion(tablero, hoy);

  for (const p of pendientes) {
    const clave = `${p.indicadorId}:${p.motivo}:${p.fechaLimite ?? ''}`;
    if (yaNotificados.has(clave)) continue;
    yaNotificados.add(clave);
    const titulo = p.motivo === 'Vencido' ? 'Indicador vencido' : 'Indicador próximo a vencer';
    const cuerpo = p.fechaLimite
      ? `${p.nombre} — fecha límite ${p.fechaLimite}`
      : p.nombre;
    new Notification({ title: titulo, body: cuerpo }).show();
  }
}

function iniciarNotificaciones(aplicacionActual: Aplicacion): void {
  void revisarVencimientos(aplicacionActual);
  temporizadorNotificaciones = setInterval(() => void revisarVencimientos(aplicacionActual), INTERVALO_NOTIFICACIONES_MS);
}

/** El directorio de datos puede fijarse por variable de entorno (pruebas E2E). */
function directorioDatos(): string {
  return process.env.KPITRACKER_DATA_DIR ?? join(app.getPath('userData'), 'Data');
}

/**
 * Cierra la `Aplicacion` activa (flush de Parquet incluido, ver
 * `bootstrap.ts#cerrar`) y detiene las notificaciones periódicas. Deja
 * `aplicacion` en `null` — ventana de tiempo en la que `registrarIpc`
 * responde "no está lista" a cualquier canal.
 */
async function desactivarPerfil(): Promise<void> {
  if (temporizadorNotificaciones) {
    clearInterval(temporizadorNotificaciones);
    temporizadorNotificaciones = null;
  }
  if (aplicacion) {
    const actual = aplicacion;
    aplicacion = null;
    await actual.cerrar();
  }
}

/** Abre una `Aplicacion` sobre `ruta` y reinicia las notificaciones periódicas. */
async function activarPerfil(ruta: string): Promise<void> {
  aplicacion = await componerAplicacion(ruta, app.getVersion());
  iniciarNotificaciones(aplicacion);
}

/** Serializa cambios de perfil concurrentes: un segundo intento mientras uno está en curso se rechaza. */
let cambioEnCurso: Promise<void> | null = null;

/**
 * Cierra el perfil actual y abre `rutaNueva`. Si `rutaNueva` falla al
 * abrir (datos corruptos, disco no disponible...), reabre `rutaAnterior`
 * automáticamente para no dejar la app sin ningún perfil activo.
 */
async function cambiarPerfil(rutaNueva: string, rutaAnterior: string): Promise<void> {
  if (cambioEnCurso) throw new ValidacionError('Ya hay un cambio de perfil en curso.');
  const ejecutar = async (): Promise<void> => {
    await desactivarPerfil();
    try {
      await activarPerfil(rutaNueva);
    } catch (error) {
      await activarPerfil(rutaAnterior);
      throw new ValidacionError('No se pudo abrir el perfil.', [String(error)]);
    }
  };
  cambioEnCurso = ejecutar();
  try {
    await cambioEnCurso;
  } finally {
    cambioEnCurso = null;
  }
}

/**
 * Registra todos los canales UNA sola vez, al arranque. Cada handler
 * resuelve `aplicacion` (variable de módulo) en el momento de la llamada
 * en vez de capturar una instantánea — así tolera que `aplicacion` se
 * reemplace en caliente (cambio de perfil) sin volver a registrar
 * handlers, lo que Electron rechaza con "Attempted to register a second
 * handler" si se intenta.
 */
function registrarIpc(): void {
  for (const canal of NOMBRES_CANALES) {
    ipcMain.handle(canal, async (_evento, payload: unknown): Promise<RespuestaIpc<unknown>> => {
      try {
        const local = manejadoresLocales[canal] as ((p: unknown) => Promise<unknown>) | undefined;
        if (local) return { ok: true, datos: await local(payload) };
        if (!aplicacion) return { ok: false, error: 'La aplicación no está lista (cambiando de perfil).' };
        const manejadores = aplicacion.manejadores as Record<string, (p: unknown) => Promise<unknown>>;
        const manejador = manejadores[canal];
        if (!manejador) return { ok: false, error: `Canal no implementado: ${canal}.` };
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
  await activarPerfil(await gestorPerfiles.rutaActiva());
  registrarIpc();
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
    void desactivarPerfil().finally(() => app.quit());
  }
});
