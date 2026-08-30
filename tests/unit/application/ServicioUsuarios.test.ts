import { describe, expect, it } from 'vitest';
import { ID_ROL_ADMINISTRADOR, ID_WORKSPACE_DEFAULT, ValidacionError } from '@domain/index';
import type { Equipo, Indicador, Rol, RolGlobal, Usuario, Workspace } from '@domain/index';
import type {
  ICatalogoRepository, ICredencialGeneradaRepository, IIndicadorRepository, IPermisoExcepcionalRepository,
  IRolGlobalRepository, IRolRepository, IUsuarioRepository
} from '@application/ports/index';
import { ServicioUsuarios } from '@application/use-cases/ServicioUsuarios';
import { ProveedorPassword } from '@infrastructure/auth/ProveedorPassword';
import { GeneradorUuid, RelojSistema } from '@infrastructure/soporte/servicios';

const EQUIPO_GENERAL_ID = 'equipo-general';

class UsuarioRepositoryMemoria implements IUsuarioRepository {
  private readonly filas = new Map<string, Usuario>();
  async listar(incluirEliminados = false): Promise<Usuario[]> {
    return [...this.filas.values()].filter((u) => incluirEliminados || !u.eliminado);
  }
  async obtener(id: string): Promise<Usuario | null> { return this.filas.get(id) ?? null; }
  async obtenerPorNombreUsuario(nombreUsuario: string): Promise<Usuario | null> {
    return [...this.filas.values()].find((u) => u.nombreUsuario === nombreUsuario) ?? null;
  }
  async guardar(usuario: Usuario): Promise<void> { this.filas.set(usuario.id, usuario); }
  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    const item = this.filas.get(id);
    if (item) this.filas.set(id, { ...item, eliminado });
  }
}

class RolRepositoryMemoria implements IRolRepository {
  private readonly filas = new Map<string, Rol>();
  async listar(workspaceId: string): Promise<Rol[]> {
    return [...this.filas.values()].filter((r) => r.workspaceId === workspaceId);
  }
  async obtener(id: string): Promise<Rol | null> { return this.filas.get(id) ?? null; }
  async guardar(rol: Rol): Promise<void> { this.filas.set(rol.id, rol); }
  async eliminar(id: string): Promise<void> { this.filas.delete(id); }
}

class RolGlobalRepositoryMemoria implements IRolGlobalRepository {
  private readonly filas = new Map<string, RolGlobal>();
  async listar(): Promise<RolGlobal[]> { return [...this.filas.values()]; }
  async obtener(id: string): Promise<RolGlobal | null> { return this.filas.get(id) ?? null; }
  async guardar(rol: RolGlobal): Promise<void> { this.filas.set(rol.id, rol); }
  async eliminar(id: string): Promise<void> { this.filas.delete(id); }
}

class WorkspaceRepositoryMemoria implements ICatalogoRepository<Workspace> {
  private readonly filas = new Map<string, Workspace>();
  constructor() {
    this.filas.set(ID_WORKSPACE_DEFAULT, {
      id: ID_WORKSPACE_DEFAULT, nombre: 'General', activo: true, eliminado: false,
      creadoEn: '2026-01-01', actualizadoEn: '2026-01-01'
    });
  }
  async listar(): Promise<Workspace[]> { return [...this.filas.values()]; }
  async obtener(id: string): Promise<Workspace | null> { return this.filas.get(id) ?? null; }
  async guardar(item: Workspace): Promise<void> { this.filas.set(item.id, item); }
  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    const item = this.filas.get(id);
    if (item) this.filas.set(id, { ...item, eliminado });
  }
}

class PermisoExcepcionalRepositoryMemoria implements IPermisoExcepcionalRepository {
  private readonly porUsuario = new Map<string, string[]>();
  async listarPorUsuario(usuarioId: string): Promise<string[]> { return this.porUsuario.get(usuarioId) ?? []; }
  async establecer(usuarioId: string, permisos: string[]): Promise<void> { this.porUsuario.set(usuarioId, permisos); }
}

class EquipoRepositoryMemoria implements ICatalogoRepository<Equipo> {
  private readonly filas = new Map<string, Equipo>();
  constructor() {
    this.filas.set(EQUIPO_GENERAL_ID, {
      id: EQUIPO_GENERAL_ID, nombre: 'General', descripcion: '', activo: true, eliminado: false,
      padreId: null, creadoEn: '2026-01-01', actualizadoEn: '2026-01-01'
    });
  }
  async listar(): Promise<Equipo[]> { return [...this.filas.values()]; }
  async obtener(id: string): Promise<Equipo | null> { return this.filas.get(id) ?? null; }
  async guardar(item: Equipo): Promise<void> { this.filas.set(item.id, item); }
  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    const item = this.filas.get(id);
    if (item) this.filas.set(id, { ...item, eliminado });
  }
}

class IndicadorRepositoryMemoria implements IIndicadorRepository {
  private readonly filas = new Map<string, Indicador>();
  async listar(): Promise<Indicador[]> { return [...this.filas.values()]; }
  async obtener(id: string): Promise<Indicador | null> { return this.filas.get(id) ?? null; }
  async buscarPorCodigo(): Promise<Indicador | null> { return null; }
  async guardar(indicador: Indicador): Promise<void> { this.filas.set(indicador.id, indicador); }
  async eliminar(id: string): Promise<void> { this.filas.delete(id); }
}

class CredencialGeneradaRepositoryMemoria implements ICredencialGeneradaRepository {
  private readonly pendientes = new Map<string, string>();
  private readonly nombreUsuarioPorId = new Map<string, string>();
  async registrar(usuarioId: string, passwordTexto: string): Promise<void> { this.pendientes.set(usuarioId, passwordTexto); }
  fijarNombreUsuario(usuarioId: string, nombreUsuario: string): void { this.nombreUsuarioPorId.set(usuarioId, nombreUsuario); }
  async consumirTodas(): Promise<Array<{ usuarioId: string; nombreUsuario: string; passwordTexto: string }>> {
    const resultado = [...this.pendientes.entries()].map(([usuarioId, passwordTexto]) => ({
      usuarioId, nombreUsuario: this.nombreUsuarioPorId.get(usuarioId) ?? usuarioId, passwordTexto
    }));
    this.pendientes.clear();
    return resultado;
  }
}

function construir() {
  const repo = new UsuarioRepositoryMemoria();
  const hasher = new ProveedorPassword(repo);
  const roles = new RolRepositoryMemoria();
  const permisosExcepcionales = new PermisoExcepcionalRepositoryMemoria();
  const equipos = new EquipoRepositoryMemoria();
  const indicadores = new IndicadorRepositoryMemoria();
  const credenciales = new CredencialGeneradaRepositoryMemoria();
  const rolesGlobales = new RolGlobalRepositoryMemoria();
  const workspaces = new WorkspaceRepositoryMemoria();
  const servicio = new ServicioUsuarios(
    repo, new GeneradorUuid(), new RelojSistema(), hasher, roles, permisosExcepcionales,
    equipos, indicadores, credenciales, EQUIPO_GENERAL_ID, rolesGlobales, workspaces
  );
  return { servicio, repo, roles, equipos, indicadores, credenciales, rolesGlobales, workspaces };
}

describe('ServicioUsuarios', () => {
  it('crea un usuario no-administrador por defecto y nunca expone el hash', async () => {
    const { servicio } = construir();
    const creado = await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María Gómez', password: 'contrasenaSegura1' });
    expect(creado.esAdministrador).toBe(false);
    expect(creado.activo).toBe(true);
    expect((creado as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  it('crea un usuario administrador cuando se especifica, y siempre porta el rol "Administrador" (Batch Y)', async () => {
    const { servicio } = construir();
    const creado = await servicio.crear({ nombreUsuario: 'admin1', nombreCompleto: 'Admin Uno', password: 'contrasenaSegura1', esAdministrador: true });
    expect(creado.esAdministrador).toBe(true);
    expect(creado.rolGeneralId).toBe(ID_ROL_ADMINISTRADOR);
  });

  it('rechaza un nombre de usuario duplicado', async () => {
    const { servicio } = construir();
    await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María', password: 'contrasenaSegura1' });
    await expect(servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'Otra María', password: 'otraSegura1' }))
      .rejects.toThrow(ValidacionError);
  });

  it('rechaza contraseñas de menos de 8 caracteres', async () => {
    const { servicio } = construir();
    await expect(servicio.crear({ nombreUsuario: 'corto', nombreCompleto: 'Nombre', password: 'abc123' }))
      .rejects.toThrow(/al menos 8 caracteres/);
  });

  it('rechaza un nombre de usuario vacío', async () => {
    const { servicio } = construir();
    await expect(servicio.crear({ nombreUsuario: '   ', nombreCompleto: 'Nombre', password: 'contrasenaSegura1' }))
      .rejects.toThrow(/obligatorio/);
  });

  it('listar() nunca expone el hash de contraseña', async () => {
    const { servicio } = construir();
    await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María', password: 'contrasenaSegura1' });
    const lista = await servicio.listar();
    expect(lista).toHaveLength(1);
    expect((lista[0] as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  it('cambiarPassword() actualiza el hash de forma que la contraseña anterior deja de autenticar', async () => {
    const { servicio, repo } = construir();
    const creado = await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María', password: 'contrasenaOriginal1' });
    await servicio.cambiarPassword(creado.id, 'contrasenaNueva1');

    const proveedor = new ProveedorPassword(repo);
    expect(await proveedor.autenticar('mgomez', 'contrasenaOriginal1')).toBeNull();
    expect(await proveedor.autenticar('mgomez', 'contrasenaNueva1')).not.toBeNull();
  });

  it('establecerAdministrador() cambia el flag de un usuario existente', async () => {
    const { servicio } = construir();
    const admin = await servicio.crear({ nombreUsuario: 'admin1', nombreCompleto: 'Admin', password: 'contrasenaSegura1', esAdministrador: true });
    const creado = await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María', password: 'contrasenaSegura1' });
    await servicio.establecerAdministrador(creado.id, true);
    const lista = await servicio.listar();
    expect(lista.find((u) => u.id === creado.id)?.esAdministrador).toBe(true);
    // Sanity: el admin original sigue existiendo (no se tocó).
    expect(lista.find((u) => u.id === admin.id)?.esAdministrador).toBe(true);
  });

  it('establecerActivo(false) desactiva al usuario, bloqueando futuros logins', async () => {
    const { servicio, repo } = construir();
    await servicio.crear({ nombreUsuario: 'admin0', nombreCompleto: 'Admin', password: 'contrasenaSegura1', esAdministrador: true });
    const creado = await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María', password: 'contrasenaSegura1' });
    await servicio.establecerActivo(creado.id, false);

    const proveedor = new ProveedorPassword(repo);
    expect(await proveedor.autenticar('mgomez', 'contrasenaSegura1')).toBeNull();
  });

  it('operaciones sobre un id inexistente fallan con ValidacionError', async () => {
    const { servicio } = construir();
    await expect(servicio.cambiarPassword('no-existe', 'contrasenaSegura1')).rejects.toThrow(ValidacionError);
    await expect(servicio.establecerAdministrador('no-existe', true)).rejects.toThrow(ValidacionError);
    await expect(servicio.establecerActivo('no-existe', false)).rejects.toThrow(ValidacionError);
  });

  it('exige que quede al menos un administrador activo', async () => {
    const { servicio } = construir();
    const unico = await servicio.crear({ nombreUsuario: 'admin1', nombreCompleto: 'Admin Único', password: 'contrasenaSegura1', esAdministrador: true });
    await expect(servicio.establecerAdministrador(unico.id, false)).rejects.toThrow(/al menos un administrador/);
    await expect(servicio.establecerActivo(unico.id, false)).rejects.toThrow(/al menos un administrador/);
  });

  it('permite quitar el flag de administrador si queda otro administrador activo', async () => {
    const { servicio } = construir();
    await servicio.crear({ nombreUsuario: 'admin1', nombreCompleto: 'Admin Uno', password: 'contrasenaSegura1', esAdministrador: true });
    const segundo = await servicio.crear({ nombreUsuario: 'admin2', nombreCompleto: 'Admin Dos', password: 'contrasenaSegura1', esAdministrador: true });
    await expect(servicio.establecerAdministrador(segundo.id, false)).resolves.toBeUndefined();
  });

  it('establecerEquipo() usa el equipo General por defecto si no se especifica ninguno', async () => {
    const { servicio } = construir();
    const creado = await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María', password: 'contrasenaSegura1' });
    await servicio.establecerEquipo(creado.id, null, null);
    const lista = await servicio.listar();
    expect(lista.find((u) => u.id === creado.id)?.equipoId).toBe(EQUIPO_GENERAL_ID);
  });

  it('establecerEquipo() rechaza un equipo inexistente', async () => {
    const { servicio } = construir();
    const creado = await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María', password: 'contrasenaSegura1' });
    await expect(servicio.establecerEquipo(creado.id, 'equipo-inventado', null)).rejects.toThrow(/no existe/);
  });

  it('establecerPermisosExcepcionales() rechaza un id de permiso inexistente', async () => {
    const { servicio } = construir();
    const creado = await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María', password: 'contrasenaSegura1' });
    await expect(servicio.establecerPermisosExcepcionales(creado.id, ['permiso.inventado'])).rejects.toThrow(ValidacionError);
    await expect(servicio.establecerPermisosExcepcionales(creado.id, ['resultados.ver.todos'])).resolves.toBeUndefined();
    const lista = await servicio.listar();
    expect(lista.find((u) => u.id === creado.id)?.permisosExcepcionales).toEqual(['resultados.ver.todos']);
  });

  it('eliminar()/restaurar() aplican borrado lógico, bloqueado si un indicador referencia al usuario como responsable', async () => {
    const { servicio, indicadores } = construir();
    const admin = await servicio.crear({ nombreUsuario: 'admin1', nombreCompleto: 'Admin', password: 'contrasenaSegura1', esAdministrador: true });
    const libre = await servicio.crear({ nombreUsuario: 'libre', nombreCompleto: 'Libre', password: 'contrasenaSegura1' });
    const enUso = await servicio.crear({ nombreUsuario: 'enuso', nombreCompleto: 'En Uso', password: 'contrasenaSegura1' });
    await indicadores.guardar({
      id: 'ind-1', codigo: '', nombre: 'Indicador de prueba', definicion: '', formaCalculo: null,
      periodicidad: 'Mensual' as never, lineaBase: null, lineaBasePeriodoId: null, metaGlobal: null,
      desagregaciones: [], estado: 'Activo' as never, responsable: enUso.id, categoria: null,
      equipo: null, unidadMedida: null, periodicidadPersonalizadaId: null, esCalculado: false, formula: null,
      requiereValidacion: true, creadoEn: '', actualizadoEn: ''
    });

    await expect(servicio.eliminar(admin.id)).rejects.toThrow(/administrador/);
    await expect(servicio.eliminar(enUso.id)).rejects.toThrow(/Indicador de prueba/);

    await servicio.eliminar(libre.id);
    expect((await servicio.listar()).some((u) => u.id === libre.id)).toBe(false);
    expect((await servicio.listar(true)).some((u) => u.id === libre.id)).toBe(true);

    await servicio.restaurar(libre.id);
    expect((await servicio.listar()).some((u) => u.id === libre.id)).toBe(true);
  });

  it('credencialesPendientes() lee y borra en la misma operación (se muestra una sola vez)', async () => {
    const { servicio, credenciales } = construir();
    const creado = await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María', password: 'contrasenaSegura1' });
    credenciales.fijarNombreUsuario(creado.id, 'mgomez');
    await credenciales.registrar(creado.id, 'temporal123');

    const primera = await servicio.credencialesPendientes();
    expect(primera).toEqual([{ usuarioId: creado.id, nombreUsuario: 'mgomez', passwordTexto: 'temporal123' }]);

    const segunda = await servicio.credencialesPendientes();
    expect(segunda).toEqual([]);
  });
});
