import { ValidacionError } from '@domain/index';
import type { RolUsuario, Usuario } from '@domain/index';
import type { IClock, IIdGenerator, IPasswordHasher, IUsuarioRepository } from '@application/ports/index';

/** Datos públicos de un usuario: nunca se expone `passwordHash` fuera de esta capa. */
export type UsuarioPublico = Omit<Usuario, 'passwordHash'>;

function aPublico(usuario: Usuario): UsuarioPublico {
  return {
    id: usuario.id,
    nombreUsuario: usuario.nombreUsuario,
    nombreCompleto: usuario.nombreCompleto,
    rol: usuario.rol,
    activo: usuario.activo,
    creadoEn: usuario.creadoEn,
    actualizadoEn: usuario.actualizadoEn
  };
}

/**
 * Alta/gestión de usuarios (pantalla de administración). Complementa a
 * `ServicioAutenticacion` (que solo se ocupa de sesiones) — separado porque
 * gestionar la lista de usuarios es un caso de uso de administración, no
 * parte del flujo de login.
 */
export class ServicioUsuarios {
  constructor(
    private readonly repo: IUsuarioRepository,
    private readonly ids: IIdGenerator,
    private readonly reloj: IClock,
    private readonly hasher: IPasswordHasher
  ) {}

  async listar(): Promise<UsuarioPublico[]> {
    return (await this.repo.listar()).map(aPublico);
  }

  async crear(nombreUsuario: string, nombreCompleto: string, password: string, rol: RolUsuario = 'usuario'): Promise<UsuarioPublico> {
    const limpio = nombreUsuario.trim();
    if (!limpio) throw new ValidacionError('El nombre de usuario es obligatorio.');
    if (password.length < 8) throw new ValidacionError('La contraseña debe tener al menos 8 caracteres.');
    if (await this.repo.obtenerPorNombreUsuario(limpio)) {
      throw new ValidacionError(`Ya existe un usuario con el nombre "${limpio}".`);
    }
    const ahora = this.reloj.ahoraIso();
    const usuario: Usuario = {
      id: this.ids.nuevoId(),
      nombreUsuario: limpio,
      nombreCompleto: nombreCompleto.trim(),
      passwordHash: await this.hasher.hashear(password),
      rol,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora
    };
    await this.repo.guardar(usuario);
    return aPublico(usuario);
  }

  async cambiarPassword(id: string, passwordNueva: string): Promise<void> {
    if (passwordNueva.length < 8) throw new ValidacionError('La contraseña debe tener al menos 8 caracteres.');
    const usuario = await this.repo.obtener(id);
    if (!usuario) throw new ValidacionError('El usuario no existe.');
    await this.repo.guardar({ ...usuario, passwordHash: await this.hasher.hashear(passwordNueva), actualizadoEn: this.reloj.ahoraIso() });
  }

  async establecerRol(id: string, rol: RolUsuario): Promise<void> {
    const usuario = await this.repo.obtener(id);
    if (!usuario) throw new ValidacionError('El usuario no existe.');
    await this.repo.guardar({ ...usuario, rol, actualizadoEn: this.reloj.ahoraIso() });
  }

  async establecerActivo(id: string, activo: boolean): Promise<void> {
    const usuario = await this.repo.obtener(id);
    if (!usuario) throw new ValidacionError('El usuario no existe.');
    await this.repo.guardar({ ...usuario, activo, actualizadoEn: this.reloj.ahoraIso() });
  }
}
