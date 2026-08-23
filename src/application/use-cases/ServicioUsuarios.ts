import { ValidacionError } from '@domain/index';
import type { Usuario } from '@domain/index';
import { NOMBRE_ROL_USUARIO_ESTANDAR, permisoValido } from '@domain/index';
import type {
  IClock, IIdGenerator, IPasswordHasher, IPermisoExcepcionalRepository, IResponsableRepository, IRolRepository,
  IUsuarioRepository
} from '@application/ports/index';

/** Datos públicos de un usuario: nunca se expone `passwordHash` fuera de esta capa. */
export type UsuarioPublico = Omit<Usuario, 'passwordHash'> & { permisosExcepcionales: string[] };

/**
 * Alta/gestión de usuarios (pantalla de administración). Complementa a
 * `ServicioAutenticacion` (que solo se ocupa de sesiones) — separado porque
 * gestionar la lista de usuarios es un caso de uso de administración, no
 * parte del flujo de login.
 *
 * Batch T: reemplaza el único `establecerRol('admin'|'usuario')` por setters
 * granulares para cada campo nuevo de `Usuario` (rol general, equipo + rol
 * de equipo, responsable vinculado, permisos excepcionales), y agrega la
 * invariante "siempre debe quedar al menos un administrador activo" —
 * verificada tanto al quitarle `esAdministrador` a alguien como al
 * desactivarlo.
 */
export class ServicioUsuarios {
  constructor(
    private readonly repo: IUsuarioRepository,
    private readonly ids: IIdGenerator,
    private readonly reloj: IClock,
    private readonly hasher: IPasswordHasher,
    private readonly rolesRepo: IRolRepository,
    private readonly permisosExcepcionalesRepo: IPermisoExcepcionalRepository,
    private readonly responsablesRepo: IResponsableRepository
  ) {}

  private async aPublico(usuario: Usuario): Promise<UsuarioPublico> {
    const permisosExcepcionales = await this.permisosExcepcionalesRepo.listarPorUsuario(usuario.id);
    return {
      id: usuario.id,
      nombreUsuario: usuario.nombreUsuario,
      nombreCompleto: usuario.nombreCompleto,
      esAdministrador: usuario.esAdministrador,
      rolGeneralId: usuario.rolGeneralId,
      equipoId: usuario.equipoId,
      rolEquipoId: usuario.rolEquipoId,
      responsableId: usuario.responsableId,
      activo: usuario.activo,
      creadoEn: usuario.creadoEn,
      actualizadoEn: usuario.actualizadoEn,
      permisosExcepcionales
    };
  }

  async listar(): Promise<UsuarioPublico[]> {
    const usuarios = await this.repo.listar();
    return Promise.all(usuarios.map((u) => this.aPublico(u)));
  }

  private async rolGeneralPorDefecto(): Promise<string | null> {
    const roles = await this.rolesRepo.listar();
    return roles.find((r) => r.esSistema && r.ambito === 'general' && r.nombre === NOMBRE_ROL_USUARIO_ESTANDAR)?.id ?? null;
  }

  async crear(datos: {
    nombreUsuario: string;
    nombreCompleto: string;
    password: string;
    esAdministrador?: boolean;
    rolGeneralId?: string | null;
  }): Promise<UsuarioPublico> {
    const limpio = datos.nombreUsuario.trim();
    if (!limpio) throw new ValidacionError('El nombre de usuario es obligatorio.');
    if (datos.password.length < 8) throw new ValidacionError('La contraseña debe tener al menos 8 caracteres.');
    if (await this.repo.obtenerPorNombreUsuario(limpio)) {
      throw new ValidacionError(`Ya existe un usuario con el nombre "${limpio}".`);
    }
    const esAdministrador = datos.esAdministrador ?? false;
    const rolGeneralId = esAdministrador ? null : (datos.rolGeneralId ?? (await this.rolGeneralPorDefecto()));
    const ahora = this.reloj.ahoraIso();
    const usuario: Usuario = {
      id: this.ids.nuevoId(),
      nombreUsuario: limpio,
      nombreCompleto: datos.nombreCompleto.trim(),
      passwordHash: await this.hasher.hashear(datos.password),
      esAdministrador,
      rolGeneralId,
      equipoId: null,
      rolEquipoId: null,
      responsableId: null,
      activo: true,
      creadoEn: ahora,
      actualizadoEn: ahora
    };
    await this.repo.guardar(usuario);
    return this.aPublico(usuario);
  }

  private async obtenerOFallar(id: string): Promise<Usuario> {
    const usuario = await this.repo.obtener(id);
    if (!usuario) throw new ValidacionError('El usuario no existe.');
    return usuario;
  }

  async cambiarPassword(id: string, passwordNueva: string): Promise<void> {
    if (passwordNueva.length < 8) throw new ValidacionError('La contraseña debe tener al menos 8 caracteres.');
    const usuario = await this.obtenerOFallar(id);
    await this.repo.guardar({ ...usuario, passwordHash: await this.hasher.hashear(passwordNueva), actualizadoEn: this.reloj.ahoraIso() });
  }

  /** Verifica que, tras el cambio propuesto sobre `usuarioId`, quede al menos un administrador activo. */
  private async verificarQuedaAlMenosUnAdmin(usuarioId: string, seguiraSiendoAdminActivo: boolean): Promise<void> {
    if (seguiraSiendoAdminActivo) return;
    const todos = await this.repo.listar();
    const otrosAdminsActivos = todos.some((u) => u.id !== usuarioId && u.esAdministrador && u.activo);
    if (!otrosAdminsActivos) {
      throw new ValidacionError('Debe quedar al menos un administrador activo.');
    }
  }

  async establecerAdministrador(id: string, esAdministrador: boolean): Promise<void> {
    const usuario = await this.obtenerOFallar(id);
    await this.verificarQuedaAlMenosUnAdmin(id, esAdministrador && usuario.activo);
    const rolGeneralId = esAdministrador ? null : (usuario.rolGeneralId ?? (await this.rolGeneralPorDefecto()));
    await this.repo.guardar({ ...usuario, esAdministrador, rolGeneralId, actualizadoEn: this.reloj.ahoraIso() });
  }

  async establecerActivo(id: string, activo: boolean): Promise<void> {
    const usuario = await this.obtenerOFallar(id);
    await this.verificarQuedaAlMenosUnAdmin(id, usuario.esAdministrador && activo);
    await this.repo.guardar({ ...usuario, activo, actualizadoEn: this.reloj.ahoraIso() });
  }

  async establecerRolGeneral(id: string, rolGeneralId: string): Promise<void> {
    const usuario = await this.obtenerOFallar(id);
    const rol = await this.rolesRepo.obtener(rolGeneralId);
    if (!rol) throw new ValidacionError('El rol seleccionado no existe.');
    if (rol.ambito !== 'general') throw new ValidacionError('El rol seleccionado no es de ámbito general.');
    await this.repo.guardar({ ...usuario, rolGeneralId, actualizadoEn: this.reloj.ahoraIso() });
  }

  async establecerEquipo(id: string, equipoId: string | null, rolEquipoId: string | null): Promise<void> {
    const usuario = await this.obtenerOFallar(id);
    if (rolEquipoId) {
      if (!equipoId) throw new ValidacionError('Debe seleccionar un equipo para asignar un rol de equipo.');
      const rol = await this.rolesRepo.obtener(rolEquipoId);
      if (!rol) throw new ValidacionError('El rol de equipo seleccionado no existe.');
      if (rol.ambito !== 'equipo') throw new ValidacionError('El rol seleccionado no es de ámbito equipo.');
    }
    await this.repo.guardar({
      ...usuario,
      equipoId,
      rolEquipoId: equipoId ? rolEquipoId : null,
      actualizadoEn: this.reloj.ahoraIso()
    });
  }

  async establecerResponsable(id: string, responsableId: string | null): Promise<void> {
    const usuario = await this.obtenerOFallar(id);
    if (responsableId) {
      const responsable = await this.responsablesRepo.obtener(responsableId);
      if (!responsable) throw new ValidacionError('El responsable seleccionado no existe.');
      const todos = await this.repo.listar();
      if (todos.some((u) => u.id !== id && u.responsableId === responsableId)) {
        throw new ValidacionError(`El responsable "${responsable.nombre}" ya está vinculado a otro usuario.`);
      }
    }
    await this.repo.guardar({ ...usuario, responsableId, actualizadoEn: this.reloj.ahoraIso() });
  }

  async establecerPermisosExcepcionales(id: string, permisos: string[]): Promise<void> {
    await this.obtenerOFallar(id);
    const invalidos = permisos.filter((p) => !permisoValido(p));
    if (invalidos.length > 0) throw new ValidacionError(`Permiso(s) inválido(s): ${invalidos.join(', ')}`);
    await this.permisosExcepcionalesRepo.establecer(id, [...new Set(permisos)]);
  }
}
