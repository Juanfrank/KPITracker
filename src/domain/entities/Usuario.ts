/**
 * Usuario autenticado de la aplicación (espacio de trabajo compartido único,
 * sin multi-tenencia). La verificación de contraseña vive en
 * `ProveedorPassword` (infraestructura), no aquí — esta entidad solo modela
 * los datos persistidos.
 *
 * Batch T reemplaza el `rol: 'admin'|'usuario'` binario original por un
 * sistema de roles/permisos configurable (`Rol`, `CATALOGO_PERMISOS`):
 * - `esAdministrador` es el único flag que sigue siendo fijo en código (no
 *   una fila de `Rol`) — acceso total, incluidas las pantallas de Usuarios y
 *   Roles. Debe existir siempre al menos un usuario activo con este flag
 *   (`ServicioUsuarios` lo garantiza). El resto de los campos de abajo se
 *   ignoran cuando `esAdministrador` es `true`.
 * - `rolGeneralId` es el rol de ámbito `'general'` del usuario (exactamente
 *   uno) — por defecto el rol semilla "Usuario estándar" (sin permisos).
 * - `equipoId`/`rolEquipoId` son la pertenencia + rol de ámbito `'equipo'`
 *   del usuario — independientes del `equipoId` del `Responsable` vinculado
 *   (ver `responsableId`): en la práctica un administrador normalmente los
 *   deja iguales, pero no están acoplados en el modelo.
 * - `responsableId` vincula 1 a 1 con un `Responsable` (ver
 *   `ServicioUsuarios`, valida unicidad) — quien lo tiene seteado
 *   siempre puede ver/registrar (nunca validar) los resultados de los
 *   indicadores cuyo responsable directo sea ese mismo `Responsable`,
 *   sin importar rol/permiso (ver `puedeSobreIndicador`).
 */
export interface Usuario {
  readonly id: string;
  nombreUsuario: string;
  nombreCompleto: string;
  /** Hash bcrypt; nunca se expone el texto plano ni se serializa hacia el cliente. */
  passwordHash: string;
  esAdministrador: boolean;
  /** Rol de ámbito general (`Rol.ambito === 'general'`); ignorado si `esAdministrador`. */
  rolGeneralId: string | null;
  /** Equipo al que pertenece este usuario (independiente del equipo de su `Responsable` vinculado). */
  equipoId: string | null;
  /** Rol de ámbito equipo (`Rol.ambito === 'equipo'`); solo aplica si `equipoId` no es null. */
  rolEquipoId: string | null;
  /** Vínculo 1 a 1 con un `Responsable` — ver docstring de la interfaz. */
  responsableId: string | null;
  activo: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/**
 * Sesión de un usuario autenticado: el id es el token opaco que viaja en la
 * cookie firmada. Revocarla (logout, expiración) es borrar esta fila —
 * deliberadamente más simple que un JWT autocontenido, que no se puede
 * invalidar antes de su expiración sin un mecanismo de lista negra.
 */
export interface Sesion {
  readonly id: string;
  usuarioId: string;
  readonly creadoEn: string;
  expiraEn: string;
}
