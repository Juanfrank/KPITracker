import { puedeAdministrarCatalogos, puedeGestionarMiembrosEquipo, ValidacionError } from '@domain/index';
import type { Usuario } from '@domain/index';
import { NOMBRE_ROL_USUARIO_ESTANDAR, permisoValido } from '@domain/index';
import type {
  ICredencialGeneradaRepository, IEquipoRepository, IIndicadorRepository, IPasswordHasher,
  IPermisoExcepcionalRepository, IRolRepository, IUsuarioRepository
} from '@application/ports/index';
import { permisosActuales } from './contextoUsuario';
import { referenciasDeUsuario } from './referencias';
import type { IClock, IIdGenerator } from '@application/ports/index';

/** Datos públicos de un usuario: nunca se expone `passwordHash` fuera de esta capa. */
export type UsuarioPublico = Omit<Usuario, 'passwordHash'> & { permisosExcepcionales: string[] };

/** Credencial temporal recién generada, para mostrar al administrador una única vez. */
export interface CredencialPendiente {
  usuarioId: string;
  nombreUsuario: string;
  passwordTexto: string;
}

/**
 * Alta/gestión de usuarios (pantalla de administración). Complementa a
 * `ServicioAutenticacion` (que solo se ocupa de sesiones) — separado porque
 * gestionar la lista de usuarios es un caso de uso de administración, no
 * parte del flujo de login.
 *
 * Batch U unifica Usuario con el antiguo catálogo Responsable: absorbe su
 * CRUD completo (`correo`, borrado lógico bloqueado por referencias,
 * `equipoId` obligatorio con respaldo "General", gating de líder de equipo
 * al mover gente de/hacia su propio equipo) — todo lo que antes vivía en
 * `ServicioResponsables` (retirado). Mantiene además la invariante "siempre
 * debe quedar al menos un administrador activo".
 */
export class ServicioUsuarios {
  constructor(
    private readonly repo: IUsuarioRepository,
    private readonly ids: IIdGenerator,
    private readonly reloj: IClock,
    private readonly hasher: IPasswordHasher,
    private readonly rolesRepo: IRolRepository,
    private readonly permisosExcepcionalesRepo: IPermisoExcepcionalRepository,
    private readonly equiposRepo: IEquipoRepository,
    private readonly indicadoresRepo: IIndicadorRepository,
    private readonly credencialesRepo: ICredencialGeneradaRepository,
    private readonly equipoGeneralId: string
  ) {}

  private async aPublico(usuario: Usuario): Promise<UsuarioPublico> {
    const permisosExcepcionales = await this.permisosExcepcionalesRepo.listarPorUsuario(usuario.id);
    return {
      id: usuario.id,
      nombreUsuario: usuario.nombreUsuario,
      nombreCompleto: usuario.nombreCompleto,
      correo: usuario.correo,
      esAdministrador: usuario.esAdministrador,
      rolGeneralId: usuario.rolGeneralId,
      equipoId: usuario.equipoId,
      rolEquipoId: usuario.rolEquipoId,
      activo: usuario.activo,
      eliminado: usuario.eliminado,
      creadoEn: usuario.creadoEn,
      actualizadoEn: usuario.actualizadoEn,
      permisosExcepcionales
    };
  }

  async listar(incluirEliminados = false): Promise<UsuarioPublico[]> {
    const usuarios = await this.repo.listar(incluirEliminados);
    return Promise.all(usuarios.map((u) => this.aPublico(u)));
  }

  /** Usado por "Ver como" (Batch U, panel de simulación de solo lectura) para validar y describir al usuario elegido. */
  async obtener(id: string): Promise<UsuarioPublico | null> {
    const usuario = await this.repo.obtener(id);
    return usuario ? this.aPublico(usuario) : null;
  }

  private async rolGeneralPorDefecto(): Promise<string | null> {
    const roles = await this.rolesRepo.listar();
    return roles.find((r) => r.esSistema && r.ambito === 'general' && r.nombre === NOMBRE_ROL_USUARIO_ESTANDAR)?.id ?? null;
  }

  async crear(datos: {
    nombreUsuario: string;
    nombreCompleto: string;
    correo?: string | null;
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
      correo: datos.correo?.trim() || null,
      passwordHash: await this.hasher.hashear(datos.password),
      esAdministrador,
      rolGeneralId,
      equipoId: null,
      rolEquipoId: null,
      activo: true,
      eliminado: false,
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

  /**
   * Batch U: `equipoId` es el mismo campo que antes vivía en `Responsable`
   * (indirectamente "responsable" de sus indicadores asignados) — por eso,
   * a diferencia de antes, `equipoId` NO puede quedar en null: sin equipo
   * explícito, cae al equipo "General" (mismo respaldo que ya usa T1 para
   * indicadores/responsables sin clasificar). El gating de líder de equipo
   * que antes vivía en `ServicioResponsables.guardar` se mueve aquí tal
   * cual.
   */
  async establecerEquipo(id: string, equipoIdSolicitado: string | null, rolEquipoId: string | null): Promise<void> {
    const usuario = await this.obtenerOFallar(id);
    const equipoId = equipoIdSolicitado || this.equipoGeneralId;
    if (!(await this.equiposRepo.obtener(equipoId))) {
      throw new ValidacionError('El equipo seleccionado no existe.');
    }
    if (rolEquipoId) {
      const rol = await this.rolesRepo.obtener(rolEquipoId);
      if (!rol) throw new ValidacionError('El rol de equipo seleccionado no existe.');
      if (rol.ambito !== 'equipo') throw new ValidacionError('El rol seleccionado no es de ámbito equipo.');
    }

    const ctx = permisosActuales();
    if (!usuario.esAdministrador && !puedeAdministrarCatalogos(ctx)) {
      // El líder de equipo puede: añadir alguien a su equipo (equipoId nuevo == su equipo) o
      // sacar a alguien de su equipo (equipoId anterior == su equipo) — cualquiera de los dos alcanza.
      const puede = puedeGestionarMiembrosEquipo(ctx, equipoId) || puedeGestionarMiembrosEquipo(ctx, usuario.equipoId);
      if (!puede) throw new ValidacionError('No tiene permiso para gestionar miembros de este equipo.');
    }

    await this.repo.guardar({
      ...usuario,
      equipoId,
      rolEquipoId,
      actualizadoEn: this.reloj.ahoraIso()
    });
  }

  async establecerPermisosExcepcionales(id: string, permisos: string[]): Promise<void> {
    await this.obtenerOFallar(id);
    const invalidos = permisos.filter((p) => !permisoValido(p));
    if (invalidos.length > 0) throw new ValidacionError(`Permiso(s) inválido(s): ${invalidos.join(', ')}`);
    await this.permisosExcepcionalesRepo.establecer(id, [...new Set(permisos)]);
  }

  async guardarDatos(id: string, datos: { nombreCompleto: string; correo?: string | null }): Promise<void> {
    const usuario = await this.obtenerOFallar(id);
    if (!datos.nombreCompleto.trim()) throw new ValidacionError('El nombre completo es obligatorio.');
    await this.repo.guardar({
      ...usuario,
      nombreCompleto: datos.nombreCompleto.trim(),
      correo: datos.correo?.trim() || null,
      actualizadoEn: this.reloj.ahoraIso()
    });
  }

  /** Borrado lógico (mismo criterio que Categoría/Equipo): bloqueado si algún indicador lo referencia como responsable directo. */
  async eliminar(id: string): Promise<void> {
    const usuario = await this.obtenerOFallar(id);
    if (usuario.esAdministrador) throw new ValidacionError('No se puede eliminar a un administrador.');
    const referencias = await referenciasDeUsuario({ indicadores: this.indicadoresRepo }, id);
    if (referencias.length > 0) {
      throw new ValidacionError(`No se puede eliminar: en uso por ${referencias.join(', ')}.`);
    }
    await this.repo.marcarEliminado(id, true);
  }

  async restaurar(id: string): Promise<void> {
    await this.obtenerOFallar(id);
    await this.repo.marcarEliminado(id, false);
  }

  /** Lee y borra en la misma operación las credenciales temporales pendientes de mostrar — "una sola vez". */
  async credencialesPendientes(): Promise<CredencialPendiente[]> {
    const pendientes = await this.credencialesRepo.consumirTodas();
    return pendientes.map((p) => ({ usuarioId: p.usuarioId, nombreUsuario: p.nombreUsuario, passwordTexto: p.passwordTexto }));
  }
}
