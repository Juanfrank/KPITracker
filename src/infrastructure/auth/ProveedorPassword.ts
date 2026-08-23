import bcrypt from 'bcrypt';
import type { IAuthProvider, IPasswordHasher, IUsuarioRepository } from '@application/ports/index';
import type { Usuario } from '@domain/index';

/** Costo de bcrypt: 12 rondas es el estándar actual (balance costo/seguridad) sin parámetros de memoria que ajustar. */
const RONDAS_BCRYPT = 12;

/**
 * Autenticación por usuario/contraseña contra `usuarios` (hash bcrypt).
 * Implementa dos puertos porque hashear (alta/cambio de contraseña) y
 * verificar (login) son casos de uso distintos en la capa de aplicación,
 * aunque compartan la misma librería de hashing detrás. Es deliberadamente
 * la única pieza que sabe cómo se estableció la identidad — ver
 * `IAuthProvider` para el punto de enganche de un futuro reemplazo por
 * Azure AD/Entra ID.
 */
export class ProveedorPassword implements IAuthProvider, IPasswordHasher {
  constructor(private readonly usuarios: IUsuarioRepository) {}

  hashear(password: string): Promise<string> {
    return bcrypt.hash(password, RONDAS_BCRYPT);
  }

  async autenticar(nombreUsuario: string, password: string): Promise<{ id: string; rol: Usuario['rol'] } | null> {
    const usuario = await this.usuarios.obtenerPorNombreUsuario(nombreUsuario.trim());
    if (!usuario || !usuario.activo) return null;
    const valido = await bcrypt.compare(password, usuario.passwordHash);
    if (!valido) return null;
    return { id: usuario.id, rol: usuario.rol };
  }
}
