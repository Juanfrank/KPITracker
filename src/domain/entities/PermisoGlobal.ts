/**
 * Catálogo fijo de permisos GLOBALES (Batch AX) — distinto de
 * `CATALOGO_PERMISOS` (Batch T): aquel gobierna qué puede hacer un usuario
 * DENTRO de un Workspace (workspace-scoped, vía `Rol`); este gobierna la
 * administración de los Workspaces mismos — crearlos, administrarlos,
 * eliminarlos, cambiar a cualquiera (no solo aquel en el que el usuario
 * "vive" hoy) y administrar el catálogo de `RolGlobal`. Un `RolGlobal`
 * (p. ej. "Super administrador") agrupa un subconjunto de estos permisos —
 * misma mecánica que `Rol`/`CATALOGO_PERMISOS`, con su propio catálogo fijo
 * en vez de compartir el de ámbito Workspace.
 */
export interface DefinicionPermisoGlobal {
  readonly id: string;
  readonly etiqueta: string;
}

export const CATALOGO_PERMISOS_GLOBALES: readonly DefinicionPermisoGlobal[] = [
  { id: 'workspaces.crear', etiqueta: 'Crear workspaces' },
  { id: 'workspaces.administrar', etiqueta: 'Renombrar y activar/desactivar cualquier workspace' },
  { id: 'workspaces.eliminar', etiqueta: 'Eliminar workspaces' },
  {
    id: 'workspaces.cambiar',
    etiqueta: 'Cambiar a cualquier workspace (no solo el propio) y administrar sus roles'
  },
  { id: 'rolesGlobales.administrar', etiqueta: 'Administrar roles globales' }
];

const IDS_VALIDOS_GLOBAL = new Set(CATALOGO_PERMISOS_GLOBALES.map((p) => p.id));

export function permisoGlobalValido(id: string): boolean {
  return IDS_VALIDOS_GLOBAL.has(id);
}
