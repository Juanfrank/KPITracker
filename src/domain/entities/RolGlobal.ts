/**
 * Rol configurable de ámbito GLOBAL (Batch AX) — la contraparte, a nivel de
 * Workspace, del `Rol` workspace-scoped ya existente (Batch T): agrupa
 * permisos de `CATALOGO_PERMISOS_GLOBALES` bajo un nombre. Un `Usuario`
 * porta a lo sumo un `RolGlobal` (`Usuario.rolGlobalId`), independiente del
 * `Rol` que tenga en cada Workspace — quien tiene uno puede crear
 * Workspaces, cambiar entre ellos y administrarlos, sin que eso implique
 * ningún permiso DENTRO de un Workspace concreto (esos siguen viniendo de
 * `Rol`/`Usuario.rolGeneralId`/`rolEquipoId`).
 *
 * "Super administrador" es el único rol semilla (`esSistema: true`): no se
 * puede borrar ni renombrar, pero su lista de permisos sí es editable —
 * mismo criterio que los roles semilla de `Rol.ts`.
 */
export interface RolGlobal {
  readonly id: string;
  nombre: string;
  /** Ids de `CATALOGO_PERMISOS_GLOBALES`. */
  permisos: string[];
  esSistema: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}

export const NOMBRE_ROL_GLOBAL_SUPER_ADMINISTRADOR = 'Super administrador';

/** Id fijo (no generado) — ver la migración `20261120000000_workspaces.ts`, que lo siembra con todos los permisos del catálogo y se lo asigna a todo usuario ya `esAdministrador`. */
export const ID_ROL_GLOBAL_SUPER_ADMINISTRADOR = 'rol-global-super-administrador';
