import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Identidad del usuario autenticado "ambiente" para la cadena de llamadas
 * async actual — quien la puebla es la capa de transporte (tRPC, ver
 * `src/server/trpc/context.ts`) al inicio de cada request, vía `conUsuario`.
 *
 * Se eligió `AsyncLocalStorage` (nativo de Node) en vez de threadear un
 * parámetro `usuarioActual` a través de cada `ServicioX.auditar(...)` y de
 * cada método público que termina llamándolo: `auditar()` se invoca desde
 * decenas de sitios en todo `application/use-cases/*.ts` (cada
 * guardar/eliminar/restaurar de cada entidad) — threadearlo habría sido un
 * cambio invasivo tocando casi todos esos archivos. Con este enfoque,
 * `ContextoAplicacion`/`ServicioBase`/`ServicioRecoleccion` no cambian de
 * forma en absoluto; toda la app de escritorio Electron (que nunca llama
 * `conUsuario`) sigue auditando como `'local'` exactamente como antes —
 * cero cambios en `src/main/`.
 */
const almacen = new AsyncLocalStorage<string>();

/** Usuario autenticado de la request actual, o `'local'` fuera de una llamada `conUsuario` (app de escritorio, tareas de arranque). */
export function usuarioActual(): string {
  return almacen.getStore() ?? 'local';
}

/** Ejecuta `fn` con `usuarioId` como identidad ambiente para toda la auditoría que ocurra durante esa llamada. */
export function conUsuario<T>(usuarioId: string, fn: () => Promise<T>): Promise<T> {
  return almacen.run(usuarioId, fn);
}
