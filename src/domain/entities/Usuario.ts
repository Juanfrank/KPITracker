/**
 * Usuario autenticado de la aplicación (espacio de trabajo compartido único,
 * sin multi-tenencia). La verificación de contraseña vive en
 * `ProveedorPassword` (infraestructura), no aquí — esta entidad solo modela
 * los datos persistidos.
 *
 * Batch T reemplaza el `rol: 'admin'|'usuario'` binario original por un
 * sistema de roles/permisos configurable (`Rol`, `CATALOGO_PERMISOS`):
 * - `esAdministrador` es un flag fijo en código (no una fila de `Rol`) —
 *   acceso total, incluidas las pantallas de Usuarios y Roles (siguen
 *   exigiendo este flag CRUDO, `adminProcedure`, nunca solo el rol de abajo).
 *   Debe existir siempre al menos un usuario activo con este flag
 *   (`ServicioUsuarios` lo garantiza).
 * - `rolGeneralId` es el rol de ámbito `'general'` del usuario (exactamente
 *   uno) — por defecto el rol semilla "Visitante" (Batch Z: sin ningún
 *   permiso; "Usuario estándar" sigue existiendo, con permisos de ver, pero
 *   ya no es el que se asigna automáticamente). Cuando
 *   `esAdministrador` es `true`, `ServicioUsuarios` FUERZA este campo al rol
 *   semilla "Administrador" (Batch Y, `ID_ROL_ADMINISTRADOR`) y nunca deja
 *   que se le quite — no es un flag redundante: `ServicioPermisos.resolver`
 *   trata a CUALQUIER usuario con este rol (con o sin el flag) como
 *   `esAdministrador` a efectos de `PoliticaPermisos`, así que el rol por sí
 *   solo alcanza para delegar acceso total sin tocar el flag reservado.
 * - `equipoId`/`rolEquipoId` son la pertenencia + rol de ámbito `'equipo'`
 *   del usuario.
 *
 * Batch U unifica `Usuario` y el antiguo catálogo `Responsable`: ya no
 * existen como dos entidades vinculables 1 a 1 — un `Usuario` ES la persona
 * asignable como responsable de un indicador (`Indicador.responsable` ahora
 * apunta directo a `Usuario.id`). Por eso `Usuario` gana `correo` y
 * `eliminado` (antes exclusivos de `Responsable`), y `equipoId` pasa a
 * cumplir doble función: pertenencia para el rol de equipo (RBAC) Y equipo
 * "responsable" del indicador (vínculo INDIRECTO equipo↔indicador, ver
 * `equipoEfectivo`) — ya no hace falta mantenerlos sincronizados a mano
 * porque son el mismo campo.
 */
export interface Usuario {
  readonly id: string;
  nombreUsuario: string;
  nombreCompleto: string;
  correo: string | null;
  /** Hash bcrypt; nunca se expone el texto plano ni se serializa hacia el cliente. */
  passwordHash: string;
  esAdministrador: boolean;
  /** Rol de ámbito general (`Rol.ambito === 'general'`); forzado a "Administrador" si `esAdministrador` (ver docstring de arriba). */
  rolGeneralId: string | null;
  /** Equipo al que pertenece (RBAC) y, a la vez, el equipo "responsable" indirecto de sus indicadores asignados. */
  equipoId: string | null;
  /** Rol de ámbito equipo (`Rol.ambito === 'equipo'`); solo aplica si `equipoId` no es null. */
  rolEquipoId: string | null;
  activo: boolean;
  /** Marca de borrado lógico (bloqueado si algún indicador lo referencia como responsable): distinta de `activo`, que se alterna manualmente para des/habilitar el login. */
  eliminado: boolean;
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
