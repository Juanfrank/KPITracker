import { ValidacionError } from '@domain/index';
import type { Usuario } from '@domain/index';
import type { IAuthProvider, IClock, IIdGenerator, ISesionRepository, IUsuarioRepository } from '@application/ports/index';

/** TTL fijo por sesión: sin ventana deslizante, se re-autentica al vencer. Simple a propósito para esta fase. */
export const HORAS_EXPIRACION_SESION = 8;

export interface IdentidadSesion {
  id: string;
  nombreUsuario: string;
  nombreCompleto: string;
  rol: Usuario['rol'];
}

/**
 * Orquesta el ciclo de vida de una sesión: iniciar (verificar credenciales +
 * crear la fila de sesión), validar (por token, con expiración) y cerrar
 * (borrar la fila — revocación inmediata, a diferencia de un JWT
 * autocontenido). No depende de tRPC/Express: la capa de transporte (fase 3)
 * solo traduce cookie ⇄ token y llama a estos métodos.
 */
export class ServicioAutenticacion {
  constructor(
    private readonly authProvider: IAuthProvider,
    private readonly usuarios: IUsuarioRepository,
    private readonly sesiones: ISesionRepository,
    private readonly ids: IIdGenerator,
    private readonly reloj: IClock,
    private readonly horasExpiracion: number = HORAS_EXPIRACION_SESION
  ) {}

  async iniciarSesion(nombreUsuario: string, password: string): Promise<{ sesionId: string; identidad: IdentidadSesion }> {
    const autenticado = await this.authProvider.autenticar(nombreUsuario, password);
    // Mensaje deliberadamente genérico: no revela si el usuario existe o si fue la contraseña.
    if (!autenticado) throw new ValidacionError('Usuario o contraseña incorrectos.');

    const usuario = await this.usuarios.obtener(autenticado.id);
    if (!usuario || !usuario.activo) throw new ValidacionError('Usuario o contraseña incorrectos.');

    const ahora = new Date(this.reloj.ahoraIso());
    const expiraEn = new Date(ahora.getTime() + this.horasExpiracion * 60 * 60 * 1000).toISOString();
    const sesionId = this.ids.nuevoId();
    await this.sesiones.guardar({ id: sesionId, usuarioId: usuario.id, creadoEn: this.reloj.ahoraIso(), expiraEn });

    return { sesionId, identidad: aIdentidad(usuario) };
  }

  /** Devuelve la identidad si el token es válido y no expiró; null en cualquier otro caso (nunca lanza). */
  async validarSesion(sesionId: string): Promise<IdentidadSesion | null> {
    const sesion = await this.sesiones.obtener(sesionId);
    if (!sesion) return null;
    if (new Date(sesion.expiraEn).getTime() <= Date.now()) {
      await this.sesiones.eliminar(sesion.id);
      return null;
    }
    const usuario = await this.usuarios.obtener(sesion.usuarioId);
    if (!usuario || !usuario.activo) return null;
    return aIdentidad(usuario);
  }

  async cerrarSesion(sesionId: string): Promise<void> {
    await this.sesiones.eliminar(sesionId);
  }
}

function aIdentidad(usuario: Usuario): IdentidadSesion {
  return { id: usuario.id, nombreUsuario: usuario.nombreUsuario, nombreCompleto: usuario.nombreCompleto, rol: usuario.rol };
}
