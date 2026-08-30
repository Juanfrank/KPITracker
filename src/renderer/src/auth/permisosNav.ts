import type { IdentidadConPermisos } from './AuthContext';

/**
 * Gating de UI puramente cosmético (Batch X1): decide qué ve el usuario en el
 * sidebar/rutas, con la MISMA lógica de `PoliticaPermisos.ts` (dominio) mirando
 * los campos que ya trae `auth.yo`/`auth.login` (`usuario.permisos.*`). La
 * autorización real siempre vive en el servidor (`protectedProcedure`/
 * `catalogosAdminProcedure`/`adminProcedure`) — esto solo evita mostrar
 * entradas de navegación hacia pantallas que igual rechazarían al usuario.
 */

export function tienePermisoGeneral(usuario: IdentidadConPermisos, id: string): boolean {
  return usuario.esAdministrador || usuario.permisos.generales.includes(id) || usuario.permisos.excepcionales.includes(id);
}

export function tienePermisoEquipo(usuario: IdentidadConPermisos, id: string): boolean {
  if (usuario.esAdministrador) return true;
  if (usuario.permisos.equipoId == null) return false;
  return usuario.permisos.equipo.includes(id) || usuario.permisos.excepcionales.includes(id);
}

/** Mismo criterio que `puedeAdministrarCatalogos` (dominio): gatea Indicadores/Metas/Atributos/Listas/Reglas/General. */
export function puedeAdministrarCatalogos(usuario: IdentidadConPermisos): boolean {
  return tienePermisoGeneral(usuario, 'catalogos.administrar');
}

/** Mismo criterio que `puedeVerAuditoriaTodo`/`puedeVerAuditoriaEquipo` (dominio), combinados en un solo booleano para el nav. */
export function puedeVerAuditoria(usuario: IdentidadConPermisos): boolean {
  return tienePermisoGeneral(usuario, 'auditoria.ver.todos') || tienePermisoEquipo(usuario, 'auditoria.ver.equipo');
}

// --- Batch X (X6/X7): espejo cliente de los `puedeAdministrarX`/`puedeModificarX` de `PoliticaPermisos.ts` — mismo
// criterio, solo para gating de UI (mostrar/ocultar tarjetas y la propia entrada de nav "Administración"). ---

export function puedeModificarIndicadores(usuario: IdentidadConPermisos): boolean {
  return puedeAdministrarCatalogos(usuario) || tienePermisoEquipo(usuario, 'indicadores.modificar');
}

export function puedeModificarMetas(usuario: IdentidadConPermisos): boolean {
  return puedeAdministrarCatalogos(usuario) || tienePermisoEquipo(usuario, 'metas.modificar');
}

export function puedeModificarAtributos(usuario: IdentidadConPermisos): boolean {
  return puedeAdministrarCatalogos(usuario) || tienePermisoEquipo(usuario, 'atributos.modificar');
}

export function puedeModificarListas(usuario: IdentidadConPermisos): boolean {
  return puedeAdministrarCatalogos(usuario) || tienePermisoEquipo(usuario, 'listas.modificar');
}

export function puedeModificarReglas(usuario: IdentidadConPermisos): boolean {
  return puedeAdministrarCatalogos(usuario) || tienePermisoEquipo(usuario, 'reglas.modificar');
}

export function puedeAdministrarCategorias(usuario: IdentidadConPermisos): boolean {
  return puedeAdministrarCatalogos(usuario) || tienePermisoGeneral(usuario, 'categorias.administrar');
}

export function puedeAdministrarEquipos(usuario: IdentidadConPermisos): boolean {
  return puedeAdministrarCatalogos(usuario) || tienePermisoGeneral(usuario, 'equipos.administrar');
}

export function puedeAdministrarOrigenes(usuario: IdentidadConPermisos): boolean {
  return puedeAdministrarCatalogos(usuario) || tienePermisoGeneral(usuario, 'origenes.administrar');
}

export function puedeImportarExportarRespaldo(usuario: IdentidadConPermisos): boolean {
  return puedeAdministrarCatalogos(usuario) || tienePermisoGeneral(usuario, 'respaldo.importarExportar');
}

/** Deliberadamente NO OR'd con `puedeAdministrarCatalogos` — mismo criterio que `puedeAdministrarRoles` (dominio). */
export function puedeAdministrarRoles(usuario: IdentidadConPermisos): boolean {
  return usuario.esAdministrador || tienePermisoGeneral(usuario, 'roles.administrar');
}

// --- Batch AX (fundación SaaS): espejo cliente de `PoliticaPermisosGlobal.ts` — permisos sobre
// los Workspaces mismos, distintos de los de arriba (que son sobre lo que hay DENTRO de uno). ---

function tienePermisoGlobal(usuario: IdentidadConPermisos, id: string): boolean {
  return usuario.esAdministrador || usuario.permisos.global.includes(id);
}

export function puedeCrearWorkspaces(usuario: IdentidadConPermisos): boolean {
  return tienePermisoGlobal(usuario, 'workspaces.crear');
}

export function puedeAdministrarWorkspaces(usuario: IdentidadConPermisos): boolean {
  return tienePermisoGlobal(usuario, 'workspaces.administrar');
}

export function puedeEliminarWorkspaces(usuario: IdentidadConPermisos): boolean {
  return tienePermisoGlobal(usuario, 'workspaces.eliminar');
}

export function puedeCambiarWorkspace(usuario: IdentidadConPermisos): boolean {
  return tienePermisoGlobal(usuario, 'workspaces.cambiar');
}

export function puedeAdministrarRolesGlobales(usuario: IdentidadConPermisos): boolean {
  return tienePermisoGlobal(usuario, 'rolesGlobales.administrar');
}

/** Visible en Administración si hay algo que hacer con Workspaces/roles globales: cualquiera de los de arriba. */
export function puedeVerWorkspaces(usuario: IdentidadConPermisos): boolean {
  return (
    puedeCrearWorkspaces(usuario) ||
    puedeAdministrarWorkspaces(usuario) ||
    puedeEliminarWorkspaces(usuario) ||
    puedeAdministrarRolesGlobales(usuario)
  );
}

/**
 * Visible en el nav "Administración" (Sistema) si hay algo que hacer ahí: cualquiera de las
 * tarjetas de arriba. Workspaces/Roles globales NO entran acá — viven en `Servicio >
 * Administración` (ver `puedeVerServicio` más abajo), gateadas por `puedeVerWorkspaces`.
 */
export function puedeVerAdministracion(usuario: IdentidadConPermisos): boolean {
  return (
    puedeAdministrarCatalogos(usuario) ||
    puedeAdministrarCategorias(usuario) ||
    puedeAdministrarEquipos(usuario) ||
    puedeAdministrarOrigenes(usuario) ||
    puedeImportarExportarRespaldo(usuario) ||
    puedeAdministrarRoles(usuario)
  );
}

/** Visible el propio grupo "Servicio" en el sidebar si hay algo que hacer en cualquiera de sus dos entradas. */
export function puedeVerServicio(usuario: IdentidadConPermisos): boolean {
  return puedeVerWorkspaces(usuario) || puedeCambiarWorkspace(usuario);
}
