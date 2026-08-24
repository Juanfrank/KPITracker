import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../../src/server/trpc/appRouter';
import { crearApp } from '../../src/server/app';
import type { AppConstruida } from '../../src/server/app';

/**
 * Fase 3: cliente tRPC de Node ejercitando el servidor Express real de
 * punta a punta (sesión por cookie firmada incluida) — sin tocar el
 * renderer todavía, tal como pide el plan (§8, Fase 3). La corrección de
 * cada procedimiento individual (delegan mecánicamente en
 * `Aplicacion.manejadores`) ya está cubierta por los 307 tests de
 * `aplicacion.test.ts`, que llaman esos mismos manejadores directamente —
 * aquí se prueba lo que es nuevo en esta fase: sesión, roles y el sobre de
 * error sobre el cable.
 */

let dataDir: string;
let construida: AppConstruida;
let servidor: Server;
let baseUrl: string;

/** `fetch` con un jar de cookies mínimo (una sola cookie de sesión) — imita lo que hace un navegador entre requests. */
function fetchConCookies(): typeof fetch {
  let cookie: string | null = null;
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (cookie) headers.set('cookie', cookie);
    const respuesta = await fetch(input, { ...init, headers });
    const setCookie = respuesta.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0] ?? null;
    return respuesta;
  };
}

function crearCliente(fetchImpl: typeof fetch) {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${baseUrl}/api/trpc`, fetch: fetchImpl })]
  });
}

/** Cliente ya autenticado como el admin sembrado en el primer arranque (ver `composicionServidor.ts#asegurarAdminInicial`). */
async function clienteAdmin() {
  const cliente = crearCliente(fetchConCookies());
  await cliente.auth.login.mutate({ nombreUsuario: 'admin', password: 'admin12345' });
  return cliente;
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-server-test-'));
  process.env.ADMIN_INICIAL_USUARIO = 'admin';
  process.env.ADMIN_INICIAL_PASSWORD = 'admin12345';

  construida = await crearApp({ dataDir });
  servidor = createServer(construida.app);
  await new Promise<void>((resolve) => servidor.listen(0, () => resolve()));
  const direccion = servidor.address();
  const puerto = direccion && typeof direccion === 'object' ? direccion.port : 0;
  baseUrl = `http://127.0.0.1:${puerto}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  await construida.cerrar();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.ADMIN_INICIAL_USUARIO;
  delete process.env.ADMIN_INICIAL_PASSWORD;
});

describe('Servidor tRPC — autenticación', () => {
  it('crea un administrador inicial en el primer arranque, con el que se puede iniciar sesión', async () => {
    const cliente = crearCliente(fetchConCookies());
    const identidad = await cliente.auth.login.mutate({ nombreUsuario: 'admin', password: 'admin12345' });
    expect(identidad).toMatchObject({ nombreUsuario: 'admin', esAdministrador: true });
  });

  it('rechaza credenciales incorrectas con el mismo mensaje genérico que ServicioAutenticacion, como BAD_REQUEST', async () => {
    const cliente = crearCliente(fetchConCookies());
    await expect(cliente.auth.login.mutate({ nombreUsuario: 'admin', password: 'incorrecta' })).rejects.toMatchObject({
      data: { code: 'BAD_REQUEST' },
      message: 'Usuario o contraseña incorrectos.'
    });
  });

  it('un procedimiento protegido sin sesión responde UNAUTHORIZED', async () => {
    const cliente = crearCliente(fetchConCookies());
    const error = await cliente.indicadores.listar.query().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TRPCClientError);
    expect((error as TRPCClientError<AppRouter>).data?.code).toBe('UNAUTHORIZED');
  });

  it('la sesión persiste entre requests (misma cookie) hasta el logout', async () => {
    const cliente = await clienteAdmin();
    await expect(cliente.indicadores.listar.query()).resolves.toEqual([]);
    await expect(cliente.indicadores.listar.query()).resolves.toEqual([]);

    await cliente.auth.logout.mutate();
    const error = await cliente.indicadores.listar.query().catch((e: unknown) => e);
    expect((error as TRPCClientError<AppRouter>).data?.code).toBe('UNAUTHORIZED');
  });

  it('`auth.yo` devuelve null sin sesión y la identidad con sesión — sin lanzar en ningún caso', async () => {
    const anonimo = crearCliente(fetchConCookies());
    expect(await anonimo.auth.yo.query()).toBeNull();

    const admin = await clienteAdmin();
    expect(await admin.auth.yo.query()).toMatchObject({ nombreUsuario: 'admin' });
  });

  it('una sesión expirada dispara UNAUTHORIZED y queda invalidada (fila borrada)', async () => {
    const cliente = await clienteAdmin();

    // El id real de sesión va firmado y url-encoded dentro de la cookie —
    // más simple y robusto leerlo directo de la tabla (una sola fila en este test).
    const fila = await construida.aplicacion.infra.knex('sesiones').first();
    expect(fila).toBeDefined();
    await construida.aplicacion.infra.sesiones.guardar({
      id: fila.id, usuarioId: fila.usuario_id, creadoEn: fila.creado_en, expiraEn: '2000-01-01T00:00:00.000Z'
    });

    const error = await cliente.indicadores.listar.query().catch((e: unknown) => e);
    expect((error as TRPCClientError<AppRouter>).data?.code).toBe('UNAUTHORIZED');
    expect(await construida.aplicacion.infra.sesiones.obtener(fila.id)).toBeNull();
  });

  it('un usuario sin rol admin recibe FORBIDDEN en un procedimiento de administración', async () => {
    const admin = await clienteAdmin();
    const creado = await admin.usuarios.crear.mutate({ nombreUsuario: 'jperez', nombreCompleto: 'Juan Pérez', password: 'correcta123' });

    const cliente = crearCliente(fetchConCookies());
    await cliente.auth.login.mutate({ nombreUsuario: 'jperez', password: 'correcta123' });

    // Batch U: `usuarios.listar` pasó a `protectedProcedure` (necesario para poblar el
    // selector de responsables) — el procedimiento admin-only que sigue gateado es
    // `establecerAdministrador` (y el resto de la gestión de cuentas).
    const error = await cliente.usuarios.establecerAdministrador
      .mutate({ id: creado.id, esAdministrador: true })
      .catch((e: unknown) => e);
    expect((error as TRPCClientError<AppRouter>).data?.code).toBe('FORBIDDEN');

    // Pero sí puede usar un procedimiento protegido normal, incluido `usuarios.listar`.
    await expect(cliente.indicadores.listar.query()).resolves.toEqual([]);
    await expect(cliente.usuarios.listar.query()).resolves.not.toHaveLength(0);
  });

  it('el error de negocio conserva `detalles` sobre el cable (mismo sobre que RespuestaIpc)', async () => {
    const admin = await clienteAdmin();
    const error = await admin.usuarios.crear
      .mutate({ nombreUsuario: 'admin', nombreCompleto: 'Duplicado', password: 'correcta123' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TRPCClientError);
    expect((error as TRPCClientError<AppRouter>).data?.code).toBe('BAD_REQUEST');
    expect((error as TRPCClientError<AppRouter>).message).toContain('Ya existe un usuario');
  });
});

describe('Servidor tRPC — smoke test de un router de dominio real (indicadores)', () => {
  it('guardar → listar → obtener → eliminar funciona de punta a punta a través de Express + tRPC', async () => {
    const cliente = await clienteAdmin();

    const creado = await cliente.indicadores.guardar.mutate({
      indicador: {
        id: '', codigo: 'IND-001', nombre: 'Indicador de prueba', definicion: 'Definición', formaCalculo: null,
        periodicidad: 'Trimestral', periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null,
        metaGlobal: null, desagregaciones: [], estado: 'Activo', responsable: null, categoria: null, unidadMedida: null,
        esCalculado: false, formula: null, creadoEn: '', actualizadoEn: ''
      },
      valores: []
    } as never);
    expect(creado.id).not.toBe('');

    const listados = await cliente.indicadores.listar.query();
    expect(listados).toHaveLength(1);

    const obtenido = await cliente.indicadores.obtener.query({ id: creado.id });
    expect(obtenido?.nombre).toBe('Indicador de prueba');

    await cliente.indicadores.eliminar.mutate({ id: creado.id });
    expect(await cliente.indicadores.listar.query()).toHaveLength(0);
  });
});
