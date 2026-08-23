import { describe, expect, it } from 'vitest';
import { ValidacionError } from '@domain/index';
import type { Responsable, Rol, Usuario } from '@domain/index';
import type {
  ICatalogoRepository, IPermisoExcepcionalRepository, IRolRepository, IUsuarioRepository
} from '@application/ports/index';
import { ServicioUsuarios } from '@application/use-cases/ServicioUsuarios';
import { ProveedorPassword } from '@infrastructure/auth/ProveedorPassword';
import { GeneradorUuid, RelojSistema } from '@infrastructure/soporte/servicios';

class UsuarioRepositoryMemoria implements IUsuarioRepository {
  private readonly filas = new Map<string, Usuario>();
  async listar(): Promise<Usuario[]> { return [...this.filas.values()]; }
  async obtener(id: string): Promise<Usuario | null> { return this.filas.get(id) ?? null; }
  async obtenerPorNombreUsuario(nombreUsuario: string): Promise<Usuario | null> {
    return [...this.filas.values()].find((u) => u.nombreUsuario === nombreUsuario) ?? null;
  }
  async guardar(usuario: Usuario): Promise<void> { this.filas.set(usuario.id, usuario); }
}

class RolRepositoryMemoria implements IRolRepository {
  private readonly filas = new Map<string, Rol>();
  async listar(): Promise<Rol[]> { return [...this.filas.values()]; }
  async obtener(id: string): Promise<Rol | null> { return this.filas.get(id) ?? null; }
  async guardar(rol: Rol): Promise<void> { this.filas.set(rol.id, rol); }
  async eliminar(id: string): Promise<void> { this.filas.delete(id); }
}

class PermisoExcepcionalRepositoryMemoria implements IPermisoExcepcionalRepository {
  private readonly porUsuario = new Map<string, string[]>();
  async listarPorUsuario(usuarioId: string): Promise<string[]> { return this.porUsuario.get(usuarioId) ?? []; }
  async establecer(usuarioId: string, permisos: string[]): Promise<void> { this.porUsuario.set(usuarioId, permisos); }
}

class ResponsableRepositoryMemoria implements ICatalogoRepository<Responsable> {
  private readonly filas = new Map<string, Responsable>();
  async listar(): Promise<Responsable[]> { return [...this.filas.values()]; }
  async obtener(id: string): Promise<Responsable | null> { return this.filas.get(id) ?? null; }
  async guardar(item: Responsable): Promise<void> { this.filas.set(item.id, item); }
  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    const item = this.filas.get(id);
    if (item) this.filas.set(id, { ...item, eliminado });
  }
}

function construir() {
  const repo = new UsuarioRepositoryMemoria();
  const hasher = new ProveedorPassword(repo);
  const roles = new RolRepositoryMemoria();
  const permisosExcepcionales = new PermisoExcepcionalRepositoryMemoria();
  const responsables = new ResponsableRepositoryMemoria();
  const servicio = new ServicioUsuarios(repo, new GeneradorUuid(), new RelojSistema(), hasher, roles, permisosExcepcionales, responsables);
  return { servicio, repo, roles, responsables };
}

describe('ServicioUsuarios', () => {
  it('crea un usuario no-administrador por defecto y nunca expone el hash', async () => {
    const { servicio } = construir();
    const creado = await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María Gómez', password: 'contrasenaSegura1' });
    expect(creado.esAdministrador).toBe(false);
    expect(creado.activo).toBe(true);
    expect((creado as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  it('crea un usuario administrador cuando se especifica', async () => {
    const { servicio } = construir();
    const creado = await servicio.crear({ nombreUsuario: 'admin1', nombreCompleto: 'Admin Uno', password: 'contrasenaSegura1', esAdministrador: true });
    expect(creado.esAdministrador).toBe(true);
    expect(creado.rolGeneralId).toBeNull();
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

  it('establecerResponsable() vincula 1 a 1 y rechaza un responsable ya vinculado a otro usuario', async () => {
    const { servicio, responsables } = construir();
    const resp: Responsable = {
      id: 'resp-1', nombre: 'Juan Pérez', correo: null, activo: true, eliminado: false,
      equipoId: null, creadoEn: '2026-01-01', actualizadoEn: '2026-01-01'
    };
    await responsables.guardar(resp);
    const u1 = await servicio.crear({ nombreUsuario: 'u1', nombreCompleto: 'Uno', password: 'contrasenaSegura1' });
    const u2 = await servicio.crear({ nombreUsuario: 'u2', nombreCompleto: 'Dos', password: 'contrasenaSegura1' });
    await servicio.establecerResponsable(u1.id, 'resp-1');
    await expect(servicio.establecerResponsable(u2.id, 'resp-1')).rejects.toThrow(/ya está vinculado/);
  });

  it('establecerPermisosExcepcionales() rechaza un id de permiso inexistente', async () => {
    const { servicio } = construir();
    const creado = await servicio.crear({ nombreUsuario: 'mgomez', nombreCompleto: 'María', password: 'contrasenaSegura1' });
    await expect(servicio.establecerPermisosExcepcionales(creado.id, ['permiso.inventado'])).rejects.toThrow(ValidacionError);
    await expect(servicio.establecerPermisosExcepcionales(creado.id, ['resultados.ver.todos'])).resolves.toBeUndefined();
    const lista = await servicio.listar();
    expect(lista.find((u) => u.id === creado.id)?.permisosExcepcionales).toEqual(['resultados.ver.todos']);
  });
});
