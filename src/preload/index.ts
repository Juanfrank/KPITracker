import { contextBridge, ipcRenderer } from 'electron';
import { NOMBRES_CANALES } from '@shared/ipc';
import type { ApiRenderer, NombreCanal, RespuestaIpc } from '@shared/ipc';

/**
 * Puente seguro renderer <-> main: solo expone los canales declarados en el
 * contrato IPC y convierte los errores de negocio en excepciones legibles.
 */
const canalesPermitidos = new Set<string>(NOMBRES_CANALES);

const api: ApiRenderer = {
  async invocar(canal, payload) {
    if (!canalesPermitidos.has(canal)) {
      throw new Error(`Canal IPC no permitido: ${canal}`);
    }
    const respuesta = (await ipcRenderer.invoke(canal as NombreCanal, payload)) as RespuestaIpc<never>;
    if (!respuesta.ok) {
      const error = new Error(respuesta.error);
      (error as Error & { detalles?: string[] }).detalles = respuesta.detalles;
      throw error;
    }
    return respuesta.datos;
  }
};

contextBridge.exposeInMainWorld('api', api);
