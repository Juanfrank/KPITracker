import { AsyncLocalStorage } from 'node:async_hooks';
import type { ContextoPermisos } from '@domain/index';
import { ID_WORKSPACE_DEFAULT } from '@domain/index';

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

/**
 * Igual mecanismo que arriba (`AsyncLocalStorage`), esta vez para el
 * `ContextoPermisos` resuelto por `ServicioPermisos` (Batch T) — lo puebla
 * `protectedProcedure` (`src/server/trpc/trpc.ts`) al inicio de cada request,
 * junto a `conUsuario`. Evita threadear un parámetro de permisos a través de
 * cada `Servicio*` y cada método que necesita filtrar/gatear por permiso,
 * exactamente por la misma razón documentada arriba para `usuarioActual`.
 *
 * Fuera de una llamada `conPermisos` (los 300+ tests de integración que
 * invocan `app.manejadores[canal](...)` directo, y cualquier tarea de
 * arranque) se resuelve a "sin restricción" — mismo criterio que
 * `usuarioActual()` cayendo a `'local'`: nada de este batch debía romper el
 * camino que no pasa por tRPC.
 */
const almacenPermisos = new AsyncLocalStorage<ContextoPermisos>();

const PERMISOS_SIN_RESTRICCION: ContextoPermisos = {
  esAdministrador: true,
  usuarioId: null,
  equipoId: null,
  permisosGenerales: new Set(),
  permisosEquipo: new Set(),
  permisosExcepcionales: new Set(),
  permisosGlobales: new Set(),
  permisosPorCategoria: new Map()
};

export function permisosActuales(): ContextoPermisos {
  return almacenPermisos.getStore() ?? PERMISOS_SIN_RESTRICCION;
}

export function conPermisos<T>(permisos: ContextoPermisos, fn: () => Promise<T>): Promise<T> {
  return almacenPermisos.run(permisos, fn);
}

/**
 * Igual mecanismo (`AsyncLocalStorage`) que `usuarioActual`/`permisosActuales`,
 * esta vez para el Workspace "actual" de la request (Batch AX, fundación
 * SaaS) — lo puebla `protectedProcedure` a partir de
 * `Usuario.workspaceActualId`. `ServicioRoles` lo lee para saber en qué
 * catálogo de roles operar sin que ningún llamador (routers, manejadores)
 * tenga que pasarlo a mano — mismo motivo documentado arriba: threadearlo
 * como parámetro tocaría todos los sitios que llaman a `ServicioRoles` y a
 * `roles:*` en `manejadores.ts`. Fuera de una llamada `conWorkspace` (tests
 * de integración que invocan servicios/manejadores directo, tareas de
 * arranque) se resuelve al Workspace por defecto del sistema.
 */
const almacenWorkspace = new AsyncLocalStorage<string>();

export function workspaceActual(): string {
  return almacenWorkspace.getStore() ?? ID_WORKSPACE_DEFAULT;
}

export function conWorkspace<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
  return almacenWorkspace.run(workspaceId, fn);
}
