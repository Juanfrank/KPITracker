import { describe, expect, it } from 'vitest';
import type { Usuario } from '@domain/index';
import type { IUsuarioRepository } from '@application/ports/index';
import { ProveedorPassword } from '@infrastructure/auth/ProveedorPassword';

class UsuarioRepositoryMemoria implements IUsuarioRepository {
  private readonly filas = new Map<string, Usuario>();
  async listar(): Promise<Usuario[]> { return [...this.filas.values()]; }
  async obtener(id: string): Promise<Usuario | null> { return this.filas.get(id) ?? null; }
  async obtenerPorNombreUsuario(nombreUsuario: string): Promise<Usuario | null> {
    return [...this.filas.values()].find((u) => u.nombreUsuario === nombreUsuario) ?? null;
  }
  async guardar(usuario: Usuario): Promise<void> { this.filas.set(usuario.id, usuario); }
}

describe('ProveedorPassword', () => {
  it('hashear() nunca devuelve el texto plano, y produce hashes distintos para la misma contraseña (salt aleatorio)', async () => {
    const proveedor = new ProveedorPassword(new UsuarioRepositoryMemoria());
    const h1 = await proveedor.hashear('miClaveSecreta1');
    const h2 = await proveedor.hashear('miClaveSecreta1');
    expect(h1).not.toBe('miClaveSecreta1');
    expect(h1).not.toBe(h2);
    expect(h1).toMatch(/^\$2[aby]\$/);
  });

  it('autenticar() acepta la contraseña correcta', async () => {
    const usuarios = new UsuarioRepositoryMemoria();
    const proveedor = new ProveedorPassword(usuarios);
    const passwordHash = await proveedor.hashear('correcta123');
    await usuarios.guardar({
      id: 'u1', nombreUsuario: 'ana', nombreCompleto: 'Ana', passwordHash,
      rol: 'admin', activo: true, creadoEn: '', actualizadoEn: ''
    });
    const resultado = await proveedor.autenticar('ana', 'correcta123');
    expect(resultado).toEqual({ id: 'u1', rol: 'admin' });
  });

  it('autenticar() rechaza una contraseña incorrecta', async () => {
    const usuarios = new UsuarioRepositoryMemoria();
    const proveedor = new ProveedorPassword(usuarios);
    await usuarios.guardar({
      id: 'u1', nombreUsuario: 'ana', nombreCompleto: 'Ana', passwordHash: await proveedor.hashear('correcta123'),
      rol: 'usuario', activo: true, creadoEn: '', actualizadoEn: ''
    });
    expect(await proveedor.autenticar('ana', 'otra-cosa')).toBeNull();
  });

  it('autenticar() rechaza un usuario que no existe', async () => {
    const proveedor = new ProveedorPassword(new UsuarioRepositoryMemoria());
    expect(await proveedor.autenticar('fantasma', 'lo-que-sea')).toBeNull();
  });

  it('autenticar() rechaza un usuario inactivo aunque la contraseña sea correcta', async () => {
    const usuarios = new UsuarioRepositoryMemoria();
    const proveedor = new ProveedorPassword(usuarios);
    await usuarios.guardar({
      id: 'u1', nombreUsuario: 'ana', nombreCompleto: 'Ana', passwordHash: await proveedor.hashear('correcta123'),
      rol: 'usuario', activo: false, creadoEn: '', actualizadoEn: ''
    });
    expect(await proveedor.autenticar('ana', 'correcta123')).toBeNull();
  });

  it('autenticar() recorta espacios del nombre de usuario', async () => {
    const usuarios = new UsuarioRepositoryMemoria();
    const proveedor = new ProveedorPassword(usuarios);
    await usuarios.guardar({
      id: 'u1', nombreUsuario: 'ana', nombreCompleto: 'Ana', passwordHash: await proveedor.hashear('correcta123'),
      rol: 'usuario', activo: true, creadoEn: '', actualizadoEn: ''
    });
    expect(await proveedor.autenticar('  ana  ', 'correcta123')).toEqual({ id: 'u1', rol: 'usuario' });
  });
});
