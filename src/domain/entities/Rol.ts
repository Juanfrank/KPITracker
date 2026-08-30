import type { AmbitoPermiso } from './Permiso';

/**
 * Rol configurable (Batch T): agrupa permisos de un mismo `ambito` bajo un
 * nombre. `esSistema` marca los roles semilla (Visitante, Usuario estándar,
 * Líder de equipo, Validador, Colaborador, Visor, Técnico, Administrador) —
 * su lista de `permisos` sigue siendo editable por el administrador, pero no
 * se pueden borrar ni renombrar. `Administrador` (Batch Y) SÍ es una fila de
 * esta tabla — a diferencia del flag `Usuario.esAdministrador` (que sigue
 * existiendo, reservado para las pantallas más sensibles, ver su
 * docstring), este rol es asignable/quitable como cualquier otro EXCEPTO al
 * usuario que tiene `esAdministrador=true`, a quien `ServicioUsuarios` se lo
 * fuerza siempre — ver `ID_ROL_ADMINISTRADOR` y `PoliticaPermisos`.
 */
export interface Rol {
  readonly id: string;
  nombre: string;
  ambito: AmbitoPermiso;
  /** Ids de `CATALOGO_PERMISOS`, todos del mismo `ambito` que este rol. */
  permisos: string[];
  esSistema: boolean;
  /**
   * Workspace al que pertenece este catálogo de rol (Batch AX, fundación
   * SaaS) — cada Workspace tiene su propio conjunto de roles, aunque
   * compartan nombre entre sí (la unicidad de nombre, ver
   * `ServicioRoles.guardar`, es dentro de un mismo Workspace). Inmutable
   * una vez creado, igual que `ambito`. Los roles ya existentes antes de
   * este batch quedaron todos asignados a `ID_WORKSPACE_DEFAULT` por la
   * migración `20261120000000_workspaces.ts`.
   */
  workspaceId: string;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/** Nombres reservados de los roles semilla — ver la migración `20260901000000_roles_permisos.ts` (los 4 originales), `20260930000000_roles_validador_tecnico.ts` (Batch X), `20261010000000_rol_administrador.ts` (Batch Y) y `20261020000000_rol_visitante.ts` (Batch Z). */
export const NOMBRE_ROL_USUARIO_ESTANDAR = 'Usuario estándar';
/**
 * Rol general (Batch Z, pedido explícito del usuario): sin ningún permiso —
 * "sin permisos para nada". Reemplaza a `NOMBRE_ROL_USUARIO_ESTANDAR` como el
 * rol que `ServicioUsuarios.rolGeneralPorDefecto()` asigna a todo usuario
 * nuevo sin rol explícito — un usuario recién creado ya no ve nada hasta que
 * un administrador le asigne un rol o un permiso puntual. "Usuario estándar"
 * (con sus permisos de ver, ver §Batch Y) sigue existiendo y sigue siendo
 * asignable a mano, solo dejó de ser el default.
 */
export const NOMBRE_ROL_VISITANTE = 'Visitante';
export const NOMBRE_ROL_LIDER_EQUIPO = 'Líder de equipo';
export const NOMBRE_ROL_COLABORADOR = 'Colaborador';
export const NOMBRE_ROL_VISOR = 'Visor';
/** Rol de equipo (Batch X, X6): mismos permisos que Colaborador + validar resultados + ver auditoría del equipo. */
export const NOMBRE_ROL_VALIDADOR = 'Validador';
/** Rol general (Batch X, X7; defaults ampliados en Batch Y): todos los permisos generales excepto `roles.administrar`. */
export const NOMBRE_ROL_TECNICO = 'Técnico';
/** Rol general (Batch Y): equivalente funcional a `esAdministrador` para todo chequeo de permisos — ver `ServicioPermisos.resolver`. */
export const NOMBRE_ROL_ADMINISTRADOR = 'Administrador';

/**
 * Ids FIJOS (no generados) de los roles semilla — misma razón que
 * `ID_CATEGORIA_GENERAL`/`ID_EQUIPO_GENERAL` en `Catalogos.ts`: un respaldo
 * exportado de una instalación e importado en otra debe actualizar estos
 * MISMOS roles (upsert por id), no crear duplicados con el mismo nombre.
 */
export const ID_ROL_USUARIO_ESTANDAR = 'rol-usuario-estandar';
export const ID_ROL_LIDER_EQUIPO = 'rol-lider-equipo';
export const ID_ROL_COLABORADOR = 'rol-colaborador';
export const ID_ROL_VISOR = 'rol-visor';
export const ID_ROL_VALIDADOR = 'rol-validador';
export const ID_ROL_TECNICO = 'rol-tecnico';
export const ID_ROL_ADMINISTRADOR = 'rol-administrador';
export const ID_ROL_VISITANTE = 'rol-visitante';

/**
 * Orden de visualización explícito (Batch Y) para los roles semilla — el
 * pedido del usuario fija un orden concreto para los de equipo (Líder,
 * Validador, Colaborador, Visor) que NO es alfabético. Los roles
 * personalizados (no semilla) no tienen entrada aquí y se ordenan después,
 * alfabéticamente — ver `compararRoles`.
 */
const ORDEN_ROLES_SEMILLA: ReadonlyMap<string, number> = new Map([
  [ID_ROL_ADMINISTRADOR, 1],
  [ID_ROL_VISITANTE, 2],
  [ID_ROL_USUARIO_ESTANDAR, 3],
  [ID_ROL_TECNICO, 4],
  [ID_ROL_LIDER_EQUIPO, 1],
  [ID_ROL_VALIDADOR, 2],
  [ID_ROL_COLABORADOR, 3],
  [ID_ROL_VISOR, 4]
]);

/**
 * Comparador de orden de visualización para una lista de roles del MISMO
 * ámbito: los roles semilla van primero, en el orden fijo de
 * `ORDEN_ROLES_SEMILLA`; el resto (roles creados por el administrador) va
 * después, alfabético por nombre. Se aplica en el repositorio (`orderBy`
 * no alcanza para un orden no-alfabético) y puede reusarse en el renderer
 * si hace falta reordenar en memoria.
 */
export function compararRoles(a: Rol, b: Rol): number {
  const ordenA = ORDEN_ROLES_SEMILLA.get(a.id);
  const ordenB = ORDEN_ROLES_SEMILLA.get(b.id);
  if (ordenA != null && ordenB != null) return ordenA - ordenB;
  if (ordenA != null) return -1;
  if (ordenB != null) return 1;
  return a.nombre.localeCompare(b.nombre);
}
