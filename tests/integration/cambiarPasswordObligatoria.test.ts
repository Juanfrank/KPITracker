import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../../src/server/trpc/appRouter';
import { crearApp } from '../../src/server/app';
import type { AppConstruida } from '../../src/server/app';

/**
 * Audit de seguridad (MEDIUM): el administrador sembrado en el primer
 * arranque con la contraseña por defecto ("admin1234", cuando
 * `ADMIN_INICIAL_PASSWORD` no está definida) debe cambiarla antes de poder
 * hacer cualquier otra mutación — ver `asegurarAdminInicial`
 * (composicionServidor.ts) y el gate en `protectedProcedure` (trpc.ts).
 * Archivo separado del resto de la suite de integración porque es el ÚNICO
 * escenario donde deliberadamente NO se fija `ADMIN_INICIAL_PASSWORD` — los
 * demás la fijan siempre, precisamente para no ejercitar este camino.
 */

let dataDir: string;
let construida: AppConstruida;
let servidor: Server;
let baseUrl: string;

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

function crearCliente(): ReturnType<typeof createTRPCClient<AppRouter>> {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${baseUrl}/api/trpc`, fetch: fetchConCookies() })] });
}

async function codigoError(promesa: Promise<unknown>): Promise<string | undefined> {
  try {
    await promesa;
    return undefined;
  } catch (error) {
    return (error as TRPCClientError<AppRouter>).data?.code;
  }
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-password-pendiente-test-'));
  delete process.env.ADMIN_INICIAL_USUARIO;
  delete process.env.ADMIN_INICIAL_PASSWORD; // deliberado: fuerza el camino "contraseña por defecto"

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
});

describe('Admin sembrado con contraseña por defecto — debe cambiarla antes de continuar (audit de seguridad, MEDIUM)', () => {
  it('auth.login/auth.yo marcan debeCambiarPassword=true, y toda mutación (salvo cambiarPassword/logout) se rechaza', async () => {
    const cliente = crearCliente();
    const identidad = await cliente.auth.login.mutate({ nombreUsuario: 'admin', password: 'admin1234' });
    expect(identidad.debeCambiarPassword).toBe(true);

    const yo = await cliente.auth.yo.query();
    expect(yo?.debeCambiarPassword).toBe(true);

    const codigo = await codigoError(cliente.categorias.guardar.mutate({
      id: '', nombre: 'X', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null, creadoEn: '', actualizadoEn: ''
    } as never));
    expect(codigo).toBe('FORBIDDEN');
  });

  it('cambiar la contraseña levanta el bloqueo — debeCambiarPassword pasa a false y las mutaciones vuelven a funcionar', async () => {
    const cliente = crearCliente();
    const identidad = await cliente.auth.login.mutate({ nombreUsuario: 'admin', password: 'admin1234' });

    await cliente.usuarios.cambiarPassword.mutate({ id: identidad.id, passwordNueva: 'unaContrasenaNueva123' });

    const yo = await cliente.auth.yo.query();
    expect(yo?.debeCambiarPassword).toBe(false);

    const categoria = await cliente.categorias.guardar.mutate({
      id: '', nombre: 'Ya funciona', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null, creadoEn: '', actualizadoEn: ''
    } as never);
    expect(categoria.id).not.toBe('');
  });

  it('con ADMIN_INICIAL_PASSWORD definida, el admin nace SIN el bloqueo', async () => {
    // Reconstruye la app con la variable de entorno fijada — camino ya cubierto por el resto de la suite,
    // acá solo para dejar explícito el contraste con el escenario por defecto de arriba.
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
    await construida.cerrar();
    rmSync(dataDir, { recursive: true, force: true });

    dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-password-configurada-test-'));
    process.env.ADMIN_INICIAL_PASSWORD = 'contrasenaConfigurada123';
    construida = await crearApp({ dataDir });
    servidor = createServer(construida.app);
    await new Promise<void>((resolve) => servidor.listen(0, () => resolve()));
    const direccion = servidor.address();
    baseUrl = `http://127.0.0.1:${direccion && typeof direccion === 'object' ? direccion.port : 0}`;

    const cliente = crearCliente();
    const identidad = await cliente.auth.login.mutate({ nombreUsuario: 'admin', password: 'contrasenaConfigurada123' });
    expect(identidad.debeCambiarPassword).toBe(false);
  });
});
