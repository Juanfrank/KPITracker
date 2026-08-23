/**
 * Resolución PURA de "¿puede este usuario hacer X?" (Batch T) — sin I/O, sin
 * conocer repositorios. Quien arma el `ContextoPermisos` es `ServicioPermisos`
 * (capa de aplicación, resuelve roles/permisos excepcionales desde los
 * repos); estas funciones solo deciden con los datos ya resueltos. Mismo
 * espíritu que `equipoEfectivo`/`sinCiclo` en este mismo directorio: la regla
 * de negocio vive en dominio, la orquestación con I/O vive en aplicación.
 */
export interface ContextoPermisos {
  esAdministrador: boolean;
  /** Responsable vinculado al usuario (1 a 1), o null si no tiene ninguno vinculado. */
  responsableId: string | null;
  /** Equipo del usuario (independiente del equipo de su Responsable vinculado), o null si no pertenece a ninguno. */
  equipoId: string | null;
  permisosGenerales: ReadonlySet<string>;
  /** Solo tiene sentido junto con `equipoId` — permisos del rol de equipo del usuario dentro de ESE equipo. */
  permisosEquipo: ReadonlySet<string>;
  /** Permisos concedidos individualmente, fuera del rol nativo — aplican como si fueran generales O de equipo (ver `puedeSobreIndicador`). */
  permisosExcepcionales: ReadonlySet<string>;
}

export type AccionResultado = 'ver' | 'registrar' | 'validar';

function tienePermisoEfectivo(ctx: ContextoPermisos, permiso: string): boolean {
  return ctx.permisosGenerales.has(permiso) || ctx.permisosExcepcionales.has(permiso);
}

/**
 * Regla completa para una acción sobre los RESULTADOS de un indicador
 * concreto: admin → todo; permiso general o excepcional
 * `resultados.<accion>.todos` → todo; equipo del usuario == equipo efectivo
 * del indicador Y tiene `resultados.<accion>.equipo` (rol de equipo o
 * excepcional) → ese indicador; y la regla inherente del responsable (nunca
 * para `'validar'`): el indicador tiene como responsable DIRECTO al mismo
 * `Responsable` vinculado al usuario → siempre ver/registrar ESE indicador,
 * sin mirar roles.
 */
export function puedeSobreIndicador(
  ctx: ContextoPermisos,
  accion: AccionResultado,
  indicador: { equipoEfectivoId: string | null; responsable: string | null }
): boolean {
  if (ctx.esAdministrador) return true;
  if (tienePermisoEfectivo(ctx, `resultados.${accion}.todos`)) return true;
  const permisoEquipo = `resultados.${accion}.equipo`;
  if (ctx.equipoId != null && ctx.equipoId === indicador.equipoEfectivoId) {
    if (ctx.permisosEquipo.has(permisoEquipo) || ctx.permisosExcepcionales.has(permisoEquipo)) return true;
  }
  if (accion !== 'validar' && indicador.responsable != null && indicador.responsable === ctx.responsableId) return true;
  return false;
}

export function puedeAdministrarCatalogos(ctx: ContextoPermisos): boolean {
  return ctx.esAdministrador || tienePermisoEfectivo(ctx, 'catalogos.administrar');
}

/** Quien administra el catálogo completo de indicadores ve todos, sin importar equipo/responsable. */
export function puedeVerIndicador(ctx: ContextoPermisos, indicador: { equipoEfectivoId: string | null; responsable: string | null }): boolean {
  if (puedeAdministrarCatalogos(ctx) || tienePermisoEfectivo(ctx, 'indicadores.ver.todos')) return true;
  return puedeSobreIndicador(ctx, 'ver', indicador);
}

export function puedeVerAuditoriaTodo(ctx: ContextoPermisos): boolean {
  return ctx.esAdministrador || tienePermisoEfectivo(ctx, 'auditoria.ver.todos');
}

export function puedeVerAuditoriaEquipo(ctx: ContextoPermisos, equipoId: string | null): boolean {
  if (equipoId == null || ctx.equipoId !== equipoId) return false;
  return ctx.permisosEquipo.has('auditoria.ver.equipo') || ctx.permisosExcepcionales.has('auditoria.ver.equipo');
}

function tienePermisoDeEquipo(ctx: ContextoPermisos, equipoId: string | null, permiso: string): boolean {
  if (ctx.esAdministrador || tienePermisoEfectivo(ctx, 'catalogos.administrar')) return true;
  if (equipoId == null || ctx.equipoId !== equipoId) return false;
  return ctx.permisosEquipo.has(permiso) || ctx.permisosExcepcionales.has(permiso);
}

/** Líder de equipo: añadir/eliminar miembros — solo dentro del propio equipo del usuario. */
export function puedeGestionarMiembrosEquipo(ctx: ContextoPermisos, equipoId: string | null): boolean {
  return tienePermisoDeEquipo(ctx, equipoId, 'equipo.miembros.gestionar');
}

/** Líder de equipo: asignar indicadores del equipo a sus miembros como responsable. */
export function puedeAsignarIndicadoresEquipo(ctx: ContextoPermisos, equipoId: string | null): boolean {
  return tienePermisoDeEquipo(ctx, equipoId, 'equipo.indicadores.asignar');
}
