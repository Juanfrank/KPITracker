import { describe, expect, it } from 'vitest';
import { ValidacionError } from '@domain/index';
import type { Usuario } from '@domain/index';
import type { IUsuarioRepository } from '@application/ports/index';
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

function construir() {
  const repo = new UsuarioRepositoryMemoria();
  const hasher = new ProveedorPassword(repo);
  const servicio = new ServicioUsuarios(repo, new GeneradorUuid(), new RelojSistema(), hasher);
  return { servicio, repo };
}

describe('ServicioUsuarios', () => {
  it('crea un usuario con el rol por defecto "usuario" y nunca expone el hash', async () => {
    const { servicio } = construir();
    const creado = await servicio.crear('mgomez', 'María Gómez', 'contrasenaSegura1');
    expect(creado.rol).toBe('usuario');
    expect(creado.activo).toBe(true);
    expect((creado as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  it('crea un usuario admin cuando se especifica el rol', async () => {
    const { servicio } = construir();
    const creado = await servicio.crear('admin1', 'Admin Uno', 'contrasenaSegura1', 'admin');
    expect(creado.rol).toBe('admin');
  });

  it('rechaza un nombre de usuario duplicado', async () => {
    const { servicio } = construir();
    await servicio.crear('mgomez', 'María', 'contrasenaSegura1');
    await expect(servicio.crear('mgomez', 'Otra María', 'otraSegura1')).rejects.toThrow(ValidacionError);
  });

  it('rechaza contraseñas de menos de 8 caracteres', async () => {
    const { servicio } = construir();
    await expect(servicio.crear('corto', 'Nombre', 'abc123')).rejects.toThrow(/al menos 8 caracteres/);
  });

  it('rechaza un nombre de usuario vacío', async () => {
    const { servicio } = construir();
    await expect(servicio.crear('   ', 'Nombre', 'contrasenaSegura1')).rejects.toThrow(/obligatorio/);
  });

  it('listar() nunca expone el hash de contraseña', async () => {
    const { servicio } = construir();
    await servicio.crear('mgomez', 'María', 'contrasenaSegura1');
    const lista = await servicio.listar();
    expect(lista).toHaveLength(1);
    expect((lista[0] as unknown as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  it('cambiarPassword() actualiza el hash de forma que la contraseña anterior deja de autenticar', async () => {
    const { servicio, repo } = construir();
    const creado = await servicio.crear('mgomez', 'María', 'contrasenaOriginal1');
    await servicio.cambiarPassword(creado.id, 'contrasenaNueva1');

    const proveedor = new ProveedorPassword(repo);
    expect(await proveedor.autenticar('mgomez', 'contrasenaOriginal1')).toBeNull();
    expect(await proveedor.autenticar('mgomez', 'contrasenaNueva1')).not.toBeNull();
  });

  it('establecerRol() cambia el rol de un usuario existente', async () => {
    const { servicio } = construir();
    const creado = await servicio.crear('mgomez', 'María', 'contrasenaSegura1');
    await servicio.establecerRol(creado.id, 'admin');
    const [actualizado] = await servicio.listar();
    expect(actualizado?.rol).toBe('admin');
  });

  it('establecerActivo(false) desactiva al usuario, bloqueando futuros logins', async () => {
    const { servicio, repo } = construir();
    const creado = await servicio.crear('mgomez', 'María', 'contrasenaSegura1');
    await servicio.establecerActivo(creado.id, false);

    const proveedor = new ProveedorPassword(repo);
    expect(await proveedor.autenticar('mgomez', 'contrasenaSegura1')).toBeNull();
  });

  it('operaciones sobre un id inexistente fallan con ValidacionError', async () => {
    const { servicio } = construir();
    await expect(servicio.cambiarPassword('no-existe', 'contrasenaSegura1')).rejects.toThrow(ValidacionError);
    await expect(servicio.establecerRol('no-existe', 'admin')).rejects.toThrow(ValidacionError);
    await expect(servicio.establecerActivo('no-existe', false)).rejects.toThrow(ValidacionError);
  });
});
