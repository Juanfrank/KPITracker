import { contextBridge, ipcRenderer } from 'electron';
import { NOMBRES_CANALES } from '@shared/ipc';
import type { ApiRenderer, NombreCanal, RespuestaIpc } from '@shared/ipc';

/**
 * Puente seguro renderer <-> main: solo expone los canales declarados en el
 * contrato IPC. Devuelve siempre el sobre `RespuestaIpc` sin lanzar — el
 * `throw` del `Error` final ocurre en `src/renderer/src/api.ts`, ya del
 * lado del "main world" de la página. Si se lanzara aquí, `contextBridge`
 * clonaría la excepción al cruzar al mundo aislado del preload conservando
 * solo `message` (propiedades propias como `detalles` se pierden).
 */
const canalesPermitidos = new Set<string>(NOMBRES_CANALES);

const api: ApiRenderer = {
  async invocar(canal, payload) {
    if (!canalesPermitidos.has(canal)) {
      return { ok: false, error: `Canal IPC no permitido: ${canal}` };
    }
    return (await ipcRenderer.invoke(canal as NombreCanal, payload)) as RespuestaIpc<never>;
  }
};

contextBridge.exposeInMainWorld('api', api);
