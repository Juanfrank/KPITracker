import { ValidacionError } from '@domain/index';
import type { Usuario } from '@domain/index';
import type {
  IAuthProvider, IClock, IIdGenerator, ILimitadorIntentos, ISesionRepository, IUsuarioRepository
} from '@application/ports/index';

/** TTL fijo por sesión: sin ventana deslizante, se re-autentica al vencer. Simple a propósito para esta fase. */
export const HORAS_EXPIRACION_SESION = 8;

/** Mensaje genérico también para el bloqueo por fuerza bruta — no confirma ni niega si el usuario existe. */
const MENSAJE_BLOQUEADO = 'Demasiados intentos fallidos. Intente de nuevo en unos minutos.';

export interface IdentidadSesion {
  id: string;
  nombreUsuario: string;
  nombreCompleto: string;
  esAdministrador: boolean;
  /** Batch AX (fundación SaaS): rol GLOBAL del usuario, o `null` sin ninguno — ver `RolGlobal`. */
  rolGlobalId: string | null;
  /** Batch AX: Workspace en el que "vive" ahora mismo — ver `Usuario.workspaceActualId`. */
  workspaceActualId: string;
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
    private readonly horasExpiracion: number = HORAS_EXPIRACION_SESION,
    private readonly limitador?: ILimitadorIntentos
  ) {}

  /**
   * Freno de fuerza bruta (audit de seguridad, MEDIUM): antes, un atacante
   * podía intentar adivinar la contraseña de un usuario sin ningún límite.
   * `clave` = nombre de usuario normalizado — deliberadamente sin IP (ver
   * `ILimitadorIntentos`). El mismo mensaje genérico que ya usa esta clase
   * para credenciales incorrectas: tampoco revela si el bloqueo es "muchos
   * intentos con contraseña mala" o coincidencia. `limitador` es opcional
   * (tests unitarios que no lo necesitan siguen funcionando sin pasarlo).
   */
  async iniciarSesion(nombreUsuario: string, password: string): Promise<{ sesionId: string; identidad: IdentidadSesion }> {
    const clave = nombreUsuario.trim().toLowerCase();
    const ahora = new Date(this.reloj.ahoraIso());
    if (this.limitador?.estaBloqueado(clave, ahora)) throw new ValidacionError(MENSAJE_BLOQUEADO);

    const autenticado = await this.authProvider.autenticar(nombreUsuario, password);
    // Mensaje deliberadamente genérico: no revela si el usuario existe o si fue la contraseña.
    if (!autenticado) {
      this.limitador?.registrarFallo(clave, ahora);
      throw new ValidacionError('Usuario o contraseña incorrectos.');
    }

    const usuario = await this.usuarios.obtener(autenticado.id);
    if (!usuario || !usuario.activo) {
      this.limitador?.registrarFallo(clave, ahora);
      throw new ValidacionError('Usuario o contraseña incorrectos.');
    }

    this.limitador?.limpiar(clave);
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
  return {
    id: usuario.id,
    nombreUsuario: usuario.nombreUsuario,
    nombreCompleto: usuario.nombreCompleto,
    esAdministrador: usuario.esAdministrador,
    rolGlobalId: usuario.rolGlobalId,
    workspaceActualId: usuario.workspaceActualId
  };
}
