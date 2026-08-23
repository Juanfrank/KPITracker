/** Rol mínimo de autorización: alcanza para separar administración del resto — sin matriz de permisos granular. */
export type RolUsuario = 'admin' | 'usuario';

/**
 * Usuario autenticado de la aplicación (espacio de trabajo compartido único,
 * sin multi-tenencia). La verificación de contraseña vive en
 * `ProveedorPassword` (infraestructura), no aquí — esta entidad solo modela
 * los datos persistidos.
 */
export interface Usuario {
  readonly id: string;
  nombreUsuario: string;
  nombreCompleto: string;
  /** Hash bcrypt; nunca se expone el texto plano ni se serializa hacia el cliente. */
  passwordHash: string;
  rol: RolUsuario;
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
