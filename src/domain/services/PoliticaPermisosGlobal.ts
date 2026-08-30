import type { ContextoPermisos } from './PoliticaPermisos';

/**
 * Resolución PURA de "¿puede este usuario administrar Workspaces/roles
 * globales?" (Batch AX) — mismo espíritu que `PoliticaPermisos.ts`, ahora
 * sobre `ContextoPermisos.permisosGlobales` (resuelto por `ServicioPermisos`
 * a partir de `Usuario.rolGlobalId`). `esAdministrador` sigue siendo el
 * bootstrap universal: el administrador de la instalación (flag reservado,
 * ver `Usuario.ts`) puede hacer cualquiera de estas acciones aunque no
 * tenga ningún `RolGlobal` asignado — igual criterio que ya aplican todas
 * las funciones de `PoliticaPermisos.ts`.
 */
function tienePermisoGlobal(ctx: ContextoPermisos, permiso: string): boolean {
  return ctx.esAdministrador || ctx.permisosGlobales.has(permiso);
}

export function puedeCrearWorkspaces(ctx: ContextoPermisos): boolean {
  return tienePermisoGlobal(ctx, 'workspaces.crear');
}

export function puedeAdministrarWorkspaces(ctx: ContextoPermisos): boolean {
  return tienePermisoGlobal(ctx, 'workspaces.administrar');
}

export function puedeEliminarWorkspaces(ctx: ContextoPermisos): boolean {
  return tienePermisoGlobal(ctx, 'workspaces.eliminar');
}

/** Cambiar a cualquier Workspace (no solo el propio) y administrar sus roles. */
export function puedeCambiarWorkspace(ctx: ContextoPermisos): boolean {
  return tienePermisoGlobal(ctx, 'workspaces.cambiar');
}

export function puedeAdministrarRolesGlobales(ctx: ContextoPermisos): boolean {
  return tienePermisoGlobal(ctx, 'rolesGlobales.administrar');
}
