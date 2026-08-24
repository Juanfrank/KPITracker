import { describe, expect, it } from 'vitest';
import { ValidacionError } from '@domain/index';
import type { Sesion, Usuario } from '@domain/index';
import type { ISesionRepository, IUsuarioRepository } from '@application/ports/index';
import { ServicioAutenticacion } from '@application/use-cases/ServicioAutenticacion';
import { ProveedorPassword } from '@infrastructure/auth/ProveedorPassword';
import { GeneradorUuid, RelojSistema } from '@infrastructure/soporte/servicios';

/**
 * Repositorios en memoria: implementaciones reales (no mocks/stubs con
 * aserciones de llamadas) del mismo puerto que usará el repositorio Knex de
 * la Fase 2 — permiten probar el flujo de autenticación de punta a punta
 * antes de que exista persistencia SQL.
 */
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

class SesionRepositoryMemoria implements ISesionRepository {
  private readonly filas = new Map<string, Sesion>();
  async obtener(id: string): Promise<Sesion | null> { return this.filas.get(id) ?? null; }
  async guardar(sesion: Sesion): Promise<void> { this.filas.set(sesion.id, sesion); }
  async eliminar(id: string): Promise<void> { this.filas.delete(id); }
}

async function construir() {
  const usuarios = new UsuarioRepositoryMemoria();
  const sesiones = new SesionRepositoryMemoria();
  const authProvider = new ProveedorPassword(usuarios);
  const ids = new GeneradorUuid();
  const reloj = new RelojSistema();
  const servicio = new ServicioAutenticacion(authProvider, usuarios, sesiones, ids, reloj);

  const passwordHash = await authProvider.hashear('correcta123');
  const ahora = reloj.ahoraIso();
  await usuarios.guardar({
    id: 'u1', nombreUsuario: 'jperez', nombreCompleto: 'Juan Pérez', correo: null, passwordHash,
    esAdministrador: false, rolGeneralId: null, equipoId: null, rolEquipoId: null,
    activo: true, eliminado: false, creadoEn: ahora, actualizadoEn: ahora
  });

  return { servicio, usuarios, sesiones, ids, reloj };
}

describe('ServicioAutenticacion', () => {
  it('inicia sesión con credenciales correctas y crea una fila de sesión real', async () => {
    const { servicio, sesiones } = await construir();
    const { sesionId, identidad } = await servicio.iniciarSesion('jperez', 'correcta123');
    expect(identidad).toEqual({ id: 'u1', nombreUsuario: 'jperez', nombreCompleto: 'Juan Pérez', esAdministrador: false });
    expect(await sesiones.obtener(sesionId)).not.toBeNull();
  });

  it('rechaza contraseña incorrecta con un mensaje genérico (no revela cuál campo falló)', async () => {
    const { servicio } = await construir();
    await expect(servicio.iniciarSesion('jperez', 'incorrecta')).rejects.toThrow(ValidacionError);
    await expect(servicio.iniciarSesion('jperez', 'incorrecta')).rejects.toThrow('Usuario o contraseña incorrectos.');
  });

  it('rechaza un usuario inexistente con el MISMO mensaje genérico', async () => {
    const { servicio } = await construir();
    await expect(servicio.iniciarSesion('no-existe', 'cualquiera')).rejects.toThrow('Usuario o contraseña incorrectos.');
  });

  it('rechaza login de un usuario inactivo', async () => {
    const { servicio, usuarios } = await construir();
    const usuario = await usuarios.obtener('u1');
    await usuarios.guardar({ ...usuario!, activo: false });
    await expect(servicio.iniciarSesion('jperez', 'correcta123')).rejects.toThrow('Usuario o contraseña incorrectos.');
  });

  it('validarSesion devuelve la identidad para un token vigente', async () => {
    const { servicio } = await construir();
    const { sesionId } = await servicio.iniciarSesion('jperez', 'correcta123');
    const identidad = await servicio.validarSesion(sesionId);
    expect(identidad?.nombreUsuario).toBe('jperez');
  });

  it('validarSesion devuelve null para un token inexistente', async () => {
    const { servicio } = await construir();
    expect(await servicio.validarSesion('token-inventado')).toBeNull();
  });

  it('validarSesion devuelve null (y borra la fila) para una sesión expirada', async () => {
    const { servicio, sesiones } = await construir();
    await sesiones.guardar({ id: 'sesion-vieja', usuarioId: 'u1', creadoEn: '2020-01-01T00:00:00.000Z', expiraEn: '2020-01-01T01:00:00.000Z' });
    expect(await servicio.validarSesion('sesion-vieja')).toBeNull();
    expect(await sesiones.obtener('sesion-vieja')).toBeNull();
  });

  it('cerrarSesion invalida el token: validarSesion ya no lo reconoce', async () => {
    const { servicio } = await construir();
    const { sesionId } = await servicio.iniciarSesion('jperez', 'correcta123');
    await servicio.cerrarSesion(sesionId);
    expect(await servicio.validarSesion(sesionId)).toBeNull();
  });

  it('"última en comprometerse gana": dos inicios de sesión concurrentes producen dos tokens válidos e independientes', async () => {
    const { servicio } = await construir();
    const [a, b] = await Promise.all([servicio.iniciarSesion('jperez', 'correcta123'), servicio.iniciarSesion('jperez', 'correcta123')]);
    expect(a.sesionId).not.toBe(b.sesionId);
    expect(await servicio.validarSesion(a.sesionId)).not.toBeNull();
    expect(await servicio.validarSesion(b.sesionId)).not.toBeNull();
  });
});
