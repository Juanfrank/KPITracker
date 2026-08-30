/**
 * Espacio de trabajo (Batch AX — fundación para operar la app como SaaS
 * multi-tenant, pedido explícito del usuario): unidad de aislamiento de más
 * alto nivel. Por ahora (fundación, no una retro-adaptación completa) lo
 * único que es genuinamente específico de cada Workspace es su propio
 * catálogo de `Rol` (`Rol.workspaceId`) — el resto de las entidades
 * (indicadores, categorías, equipos, resultados...) siguen operando sobre
 * un único conjunto de datos compartido entre todos los Workspaces. Ampliar
 * el aislamiento a esas entidades es trabajo explícitamente diferido a un
 * batch posterior (ver docstring de `RolGlobal`/`PoliticaPermisosGlobal`).
 */
export interface Workspace {
  readonly id: string;
  nombre: string;
  activo: boolean;
  eliminado: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/**
 * Id fijo (no generado) del Workspace creado automáticamente al migrar —
 * mismo criterio que `ID_CATEGORIA_GENERAL`/`ID_ROL_ADMINISTRADOR`: un
 * respaldo exportado de una instalación e importado en otra debe actualizar
 * este MISMO Workspace, no crear un duplicado. Ver la migración
 * `20261120000000_workspaces.ts`, que lo siembra y reasigna ahí todos los
 * `Rol`/`Usuario` existentes.
 */
export const ID_WORKSPACE_DEFAULT = 'workspace-default';
