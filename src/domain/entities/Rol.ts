import type { AmbitoPermiso } from './Permiso';

/**
 * Rol configurable (Batch T): agrupa permisos de un mismo `ambito` bajo un
 * nombre. `esSistema` marca los 4 roles semilla (Usuario estándar, Líder de
 * equipo, Colaborador, Visor) — su lista de `permisos` sigue siendo editable
 * por el administrador, pero no se pueden borrar ni renombrar (para que
 * siempre exista al menos un rol general por defecto y los 3 roles de equipo
 * descritos en el pedido original). `Administrador` NO es una fila de esta
 * tabla — es un flag reservado (`Usuario.esAdministrador`), ver el docstring
 * de `Usuario`.
 */
export interface Rol {
  readonly id: string;
  nombre: string;
  ambito: AmbitoPermiso;
  /** Ids de `CATALOGO_PERMISOS`, todos del mismo `ambito` que este rol. */
  permisos: string[];
  esSistema: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/** Nombres reservados de los 4 roles semilla — ver la migración `20260901000000_roles_permisos.ts`. */
export const NOMBRE_ROL_USUARIO_ESTANDAR = 'Usuario estándar';
export const NOMBRE_ROL_LIDER_EQUIPO = 'Líder de equipo';
export const NOMBRE_ROL_COLABORADOR = 'Colaborador';
export const NOMBRE_ROL_VISOR = 'Visor';

/**
 * Ids FIJOS (no generados) de los 4 roles semilla — misma razón que
 * `ID_CATEGORIA_GENERAL`/`ID_EQUIPO_GENERAL` en `Catalogos.ts`: un respaldo
 * exportado de una instalación e importado en otra debe actualizar estos
 * MISMOS roles (upsert por id), no crear duplicados con el mismo nombre.
 */
export const ID_ROL_USUARIO_ESTANDAR = 'rol-usuario-estandar';
export const ID_ROL_LIDER_EQUIPO = 'rol-lider-equipo';
export const ID_ROL_COLABORADOR = 'rol-colaborador';
export const ID_ROL_VISOR = 'rol-visor';
