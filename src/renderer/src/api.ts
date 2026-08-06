import type { CanalesIpc, NombreCanal } from '@shared/ipc';

/**
 * Acceso tipado al backend (proceso main) desde los ViewModels. El preload
 * (`window.api.invocar`) nunca lanza — siempre devuelve el sobre
 * `RespuestaIpc`; el `Error` (con `.detalles` para errores de validación
 * con lista de referencias) se construye y lanza aquí, ya en el "main
 * world" de la página, para que `contextBridge` no descarte esa propiedad
 * propia al cruzar desde el mundo aislado del preload.
 */
export async function invocar<C extends NombreCanal>(
  canal: C,
  payload: CanalesIpc[C]['req']
): Promise<CanalesIpc[C]['res']> {
  const respuesta = await window.api.invocar(canal, payload);
  if (!respuesta.ok) {
    const error = new Error(respuesta.error) as Error & { detalles?: string[] };
    error.detalles = respuesta.detalles;
    throw error;
  }
  return respuesta.datos;
}
