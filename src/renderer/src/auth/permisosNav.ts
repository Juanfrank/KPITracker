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
