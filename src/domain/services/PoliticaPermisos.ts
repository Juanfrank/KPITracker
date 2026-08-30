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
  /** Id del propio usuario — Batch U unificó Usuario/Responsable, así que esto ES lo que antes era `responsableId`. */
  usuarioId: string | null;
  /** Equipo del usuario, o null si no pertenece a ninguno. */
  equipoId: string | null;
  permisosGenerales: ReadonlySet<string>;
  /** Solo tiene sentido junto con `equipoId` — permisos del rol de equipo del usuario dentro de ESE equipo. */
  permisosEquipo: ReadonlySet<string>;
  /** Permisos concedidos individualmente, fuera del rol nativo — aplican como si fueran generales O de equipo (ver `puedeSobreIndicador`). */
  permisosExcepcionales: ReadonlySet<string>;
  /**
   * RBAC granular por categoría: categoriaId → conjunto de permisos de
   * ámbito `'categoria'` concedidos al usuario PARA ESA categoría concreta
   * (ver `IPermisoCategoriaRepository`/`usuarios_permisos_categoria`). Un
   * permiso concedido sobre una categoría padre no se "expande" acá — es
   * `puedeSobreIndicador` quien, recibiendo la cadena de ancestros ya
   * resuelta del indicador (`categoriasEfectivas`), busca el permiso en
   * cualquiera de esos ids.
   */
  permisosPorCategoria: ReadonlyMap<string, ReadonlySet<string>>;
  /**
   * Permisos de `CATALOGO_PERMISOS_GLOBALES` (Batch AX) — ámbito de
   * Workspaces, no de indicadores/resultados. Resueltos desde
   * `Usuario.rolGlobalId`, ver `ServicioPermisos.resolver` y
   * `PoliticaPermisosGlobal.ts`.
   */
  permisosGlobales: ReadonlySet<string>;
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
 * excepcional) → ese indicador; `resultados.<accion>.categoria` concedido
 * sobre CUALQUIER categoría de `indicador.categoriasEfectivas` (el indicador
 * hereda el permiso de una categoría padre) → ese indicador; y la regla
 * inherente del responsable (nunca para `'validar'`): el indicador tiene
 * como responsable DIRECTO al mismo usuario en curso
 * (`indicador.responsable === ctx.usuarioId`) → siempre ver/registrar ESE
 * indicador, sin mirar roles.
 */
export function puedeSobreIndicador(
  ctx: ContextoPermisos,
  accion: AccionResultado,
  indicador: { equipoEfectivoId: string | null; responsable: string | null; categoriasEfectivas?: readonly string[] }
): boolean {
  if (ctx.esAdministrador) return true;
  if (tienePermisoEfectivo(ctx, `resultados.${accion}.todos`)) return true;
  const permisoEquipo = `resultados.${accion}.equipo`;
  if (ctx.equipoId != null && ctx.equipoId === indicador.equipoEfectivoId) {
    if (ctx.permisosEquipo.has(permisoEquipo) || ctx.permisosExcepcionales.has(permisoEquipo)) return true;
  }
  const permisoCategoria = `resultados.${accion}.categoria`;
  for (const categoriaId of indicador.categoriasEfectivas ?? []) {
    if (ctx.permisosPorCategoria.get(categoriaId)?.has(permisoCategoria)) return true;
  }
  if (accion !== 'validar' && indicador.responsable != null && indicador.responsable === ctx.usuarioId) return true;
  return false;
}

export function puedeAdministrarCatalogos(ctx: ContextoPermisos): boolean {
  return ctx.esAdministrador || tienePermisoEfectivo(ctx, 'catalogos.administrar');
}

/** Quien administra el catálogo completo de indicadores ve todos, sin importar equipo/responsable. */
export function puedeVerIndicador(
  ctx: ContextoPermisos,
  indicador: { equipoEfectivoId: string | null; responsable: string | null; categoriasEfectivas?: readonly string[] }
): boolean {
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

/**
 * Delegación puntual de un catálogo concreto (Batch X, X6): admin, o
 * `catalogos.administrar` (ya cubre todos los catálogos), o el permiso de
 * equipo específico (`resultados.<x>`, tenerlo alcanza sin importar el
 * equipo propio — estos catálogos son globales, sin noción de "mi equipo"
 * al que restringir la edición, ver el docstring de `CATALOGO_PERMISOS`).
 */
function tienePermisoDeModificarCatalogo(ctx: ContextoPermisos, permiso: string): boolean {
  if (puedeAdministrarCatalogos(ctx)) return true;
  return ctx.permisosEquipo.has(permiso) || ctx.permisosExcepcionales.has(permiso);
}

export function puedeModificarIndicadores(ctx: ContextoPermisos): boolean {
  return tienePermisoDeModificarCatalogo(ctx, 'indicadores.modificar');
}

export function puedeModificarMetas(ctx: ContextoPermisos): boolean {
  return tienePermisoDeModificarCatalogo(ctx, 'metas.modificar');
}

export function puedeModificarAtributos(ctx: ContextoPermisos): boolean {
  return tienePermisoDeModificarCatalogo(ctx, 'atributos.modificar');
}

export function puedeModificarListas(ctx: ContextoPermisos): boolean {
  return tienePermisoDeModificarCatalogo(ctx, 'listas.modificar');
}

export function puedeModificarReglas(ctx: ContextoPermisos): boolean {
  return tienePermisoDeModificarCatalogo(ctx, 'reglas.modificar');
}

/**
 * Delegación puntual de una porción general de `catalogos.administrar`
 * (Batch X, X7): admin, `catalogos.administrar`, o el permiso general
 * específico (propio o excepcional).
 */
function tienePermisoDeAdministrarPorcion(ctx: ContextoPermisos, permiso: string): boolean {
  return puedeAdministrarCatalogos(ctx) || tienePermisoEfectivo(ctx, permiso);
}

export function puedeAdministrarCategorias(ctx: ContextoPermisos): boolean {
  return tienePermisoDeAdministrarPorcion(ctx, 'categorias.administrar');
}

export function puedeAdministrarEquipos(ctx: ContextoPermisos): boolean {
  return tienePermisoDeAdministrarPorcion(ctx, 'equipos.administrar');
}

export function puedeAdministrarOrigenes(ctx: ContextoPermisos): boolean {
  return tienePermisoDeAdministrarPorcion(ctx, 'origenes.administrar');
}

export function puedeImportarExportarRespaldo(ctx: ContextoPermisos): boolean {
  return tienePermisoDeAdministrarPorcion(ctx, 'respaldo.importarExportar');
}

/**
 * Administrar roles/permisos (Batch X, X7): deliberadamente NO implicado por
 * `catalogos.administrar` — es más sensible (puede conceder otros permisos)
 * que el resto de los catálogos, así que exige admin o el permiso puntual.
 * Puede asignar/desasignar cualquier rol (general o de equipo) a cualquier
 * usuario y gestionar el catálogo de roles, pero nunca el flag
 * `esAdministrador` en sí — eso sigue siendo exclusivo de un administrador
 * (`usuariosRouter.establecerAdministrador`, siempre `adminProcedure`).
 */
export function puedeAdministrarRoles(ctx: ContextoPermisos): boolean {
  return ctx.esAdministrador || tienePermisoEfectivo(ctx, 'roles.administrar');
}
