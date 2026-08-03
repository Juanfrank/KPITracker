import type { CanalesIpc, NombreCanal } from '@shared/ipc';

/** Acceso tipado al backend (proceso main) desde los ViewModels. */
export function invocar<C extends NombreCanal>(
  canal: C,
  payload: CanalesIpc[C]['req']
): Promise<CanalesIpc[C]['res']> {
  return window.api.invocar(canal, payload);
}
