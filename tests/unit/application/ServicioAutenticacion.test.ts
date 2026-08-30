import { describe, expect, it } from 'vitest';
import { ValidacionError } from '@domain/index';
import type { Sesion, Usuario } from '@domain/index';
import type { ISesionRepository, IUsuarioRepository } from '@application/ports/index';
import { HORAS_EXPIRACION_SESION, ServicioAutenticacion } from '@application/use-cases/ServicioAutenticacion';
import { ProveedorPassword } from '@infrastructure/auth/ProveedorPassword';
import { LimitadorIntentosLoginMemoria } from '@infrastructure/auth/LimitadorIntentosLoginMemoria';
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
    esAdministrador: false, rolGeneralId: null, equipoId: null, rolEquipoId: null, rolGlobalId: null, workspaceActualId: 'workspace-default',
    activo: true, eliminado: false, creadoEn: ahora, actualizadoEn: ahora
  });

  return { servicio, usuarios, sesiones, ids, reloj };
}

/** Igual que `construir()`, pero con el freno de fuerza bruta (audit de seguridad, MEDIUM) enganchado. */
async function construirConLimitador() {
  const usuarios = new UsuarioRepositoryMemoria();
  const sesiones = new SesionRepositoryMemoria();
  const authProvider = new ProveedorPassword(usuarios);
  const ids = new GeneradorUuid();
  const reloj = new RelojSistema();
  const limitador = new LimitadorIntentosLoginMemoria();
  const servicio = new ServicioAutenticacion(authProvider, usuarios, sesiones, ids, reloj, HORAS_EXPIRACION_SESION, limitador);

  const passwordHash = await authProvider.hashear('correcta123');
  const ahora = reloj.ahoraIso();
  await usuarios.guardar({
    id: 'u1', nombreUsuario: 'jperez', nombreCompleto: 'Juan Pérez', correo: null, passwordHash,
    esAdministrador: false, rolGeneralId: null, equipoId: null, rolEquipoId: null, rolGlobalId: null, workspaceActualId: 'workspace-default',
    activo: true, eliminado: false, creadoEn: ahora, actualizadoEn: ahora
  });

  return { servicio, limitador };
}

describe('ServicioAutenticacion', () => {
  it('inicia sesión con credenciales correctas y crea una fila de sesión real', async () => {
    const { servicio, sesiones } = await construir();
    const { sesionId, identidad } = await servicio.iniciarSesion('jperez', 'correcta123');
    expect(identidad).toEqual({
      id: 'u1', nombreUsuario: 'jperez', nombreCompleto: 'Juan Pérez', esAdministrador: false,
      rolGlobalId: null, workspaceActualId: 'workspace-default'
    });
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

  it('sin limitador (parámetro opcional omitido) sigue funcionando exactamente igual — compatibilidad hacia atrás', async () => {
    const { servicio } = await construir();
    for (let i = 0; i < 6; i++) {
      await expect(servicio.iniciarSesion('jperez', 'incorrecta')).rejects.toThrow('Usuario o contraseña incorrectos.');
    }
    // Ningún bloqueo — sin limitador, el login correcto sigue pasando incluso tras más de 5 fallos.
    await expect(servicio.iniciarSesion('jperez', 'correcta123')).resolves.toBeTruthy();
  });
});

describe('ServicioAutenticacion — freno de fuerza bruta (audit de seguridad, MEDIUM)', () => {
  it('bloquea tras 5 intentos fallidos, incluso con la contraseña correcta en el 6to intento', async () => {
    const { servicio } = await construirConLimitador();
    for (let i = 0; i < 5; i++) {
      await expect(servicio.iniciarSesion('jperez', 'incorrecta')).rejects.toThrow('Usuario o contraseña incorrectos.');
    }
    await expect(servicio.iniciarSesion('jperez', 'correcta123')).rejects.toThrow('Demasiados intentos fallidos');
  });

  it('un login exitoso limpia el contador — los fallos previos no se acumulan hacia un bloqueo futuro', async () => {
    const { servicio } = await construirConLimitador();
    for (let i = 0; i < 3; i++) {
      await expect(servicio.iniciarSesion('jperez', 'incorrecta')).rejects.toThrow('Usuario o contraseña incorrectos.');
    }
    await expect(servicio.iniciarSesion('jperez', 'correcta123')).resolves.toBeTruthy();
    // 3 fallos más tras el éxito — lejos de los 5 necesarios para bloquear, porque el contador se reinició.
    for (let i = 0; i < 3; i++) {
      await expect(servicio.iniciarSesion('jperez', 'incorrecta')).rejects.toThrow('Usuario o contraseña incorrectos.');
    }
    await expect(servicio.iniciarSesion('jperez', 'correcta123')).resolves.toBeTruthy();
  });

  it('el bloqueo es por usuario (normalizado a minúsculas) — un nombre de usuario distinto no se ve afectado', async () => {
    const { servicio, limitador } = await construirConLimitador();
    for (let i = 0; i < 5; i++) {
      await expect(servicio.iniciarSesion('JPeREZ', 'incorrecta')).rejects.toThrow('Usuario o contraseña incorrectos.');
    }
    expect(limitador.estaBloqueado('jperez', new Date())).toBe(true);
    expect(limitador.estaBloqueado('otro.usuario', new Date())).toBe(false);
  });
});
