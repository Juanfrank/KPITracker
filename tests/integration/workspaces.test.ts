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
 * Batch AX — fundación para operar la app como SaaS multi-tenant (pedido
 * explícito del usuario): Workspaces, roles GLOBALES, y el catálogo de
 * roles workspace-scoped ya existente (Batch T) transformado para vivir
 * dentro de un Workspace concreto en vez de ser único y compartido. Mismo
 * patrón que `servidorTrpc.test.ts` (cliente tRPC de Node contra el
 * servidor Express real, sesión por cookie firmada) — se prueba de punta a
 * punta, no solo la capa de aplicación aislada, porque lo central de esta
 * fundación es precisamente cómo interactúan sesión, Workspace ambiente y
 * el catálogo de roles.
 */

let dataDir: string;
let construida: AppConstruida;
let servidor: Server;
let baseUrl: string;

function fetchConCookies(): typeof fetch {
  const jar = new Map<string, string>();
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (jar.size > 0) headers.set('cookie', [...jar.entries()].map(([n, v]) => `${n}=${v}`).join('; '));
    const respuesta = await fetch(input, { ...init, headers });
    for (const setCookie of respuesta.headers.getSetCookie()) {
      const [par] = setCookie.split(';');
      const igual = par?.indexOf('=') ?? -1;
      if (!par || igual <= 0) continue;
      const nombre = par.slice(0, igual);
      const valor = par.slice(igual + 1);
      if (valor) jar.set(nombre, valor); else jar.delete(nombre);
    }
    return respuesta;
  };
}

function crearCliente(fetchImpl: typeof fetch) {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${baseUrl}/api/trpc`, fetch: fetchImpl })]
  });
}

async function clienteAdmin() {
  const cliente = crearCliente(fetchConCookies());
  await cliente.auth.login.mutate({ nombreUsuario: 'admin', password: 'admin12345' });
  return cliente;
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-workspaces-test-'));
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

describe('Workspaces + roles globales (Batch AX) — bootstrap de una base nueva', () => {
  it('el admin inicial nace con el rol global "Super administrador" (todos los permisos) y en el workspace por defecto', async () => {
    const admin = await clienteAdmin();
    const identidad = await admin.auth.yo.query();
    expect(identidad?.workspaceActualId).toBe('workspace-default');
    expect(identidad?.rolGlobalId).toBe('rol-global-super-administrador');
    expect(identidad?.permisos.global.sort()).toEqual(
      ['rolesGlobales.administrar', 'workspaces.administrar', 'workspaces.cambiar', 'workspaces.crear', 'workspaces.eliminar'].sort()
    );
  });

  it('el workspace por defecto ya existe y aparece en workspaces.listar', async () => {
    const admin = await clienteAdmin();
    const items = await admin.workspaces.listar.query();
    expect(items).toContainEqual(expect.objectContaining({ id: 'workspace-default', nombre: 'General' }));
  });
});

describe('Workspaces — CRUD y aislamiento de roles', () => {
  it('crea un workspace nuevo y lo lista junto al de por defecto', async () => {
    const admin = await clienteAdmin();
    const creado = await admin.workspaces.crear.mutate({ nombre: 'Acme Corp' });
    expect(creado.nombre).toBe('Acme Corp');

    const items = await admin.workspaces.listar.query();
    expect(items.map((w) => w.nombre).sort()).toEqual(['Acme Corp', 'General']);
  });

  it('el workspace por defecto no se puede eliminar (es el del sistema)', async () => {
    const admin = await clienteAdmin();
    await expect(admin.workspaces.eliminar.mutate({ id: 'workspace-default' })).rejects.toMatchObject({
      message: expect.stringContaining('en uso')
    });
  });

  it('un workspace nuevo, vacío, sí se puede eliminar', async () => {
    const admin = await clienteAdmin();
    const creado = await admin.workspaces.crear.mutate({ nombre: 'Temporal' });
    await admin.workspaces.eliminar.mutate({ id: creado.id });
    const items = await admin.workspaces.listar.query();
    expect(items.find((w) => w.id === creado.id)).toBeUndefined();
  });

  it(
    'cada workspace tiene su PROPIO catálogo de roles: un rol creado en uno no aparece en el otro, ' +
    'y el mismo nombre de rol es válido en ambos (transformación central de este batch)',
    async () => {
      const admin = await clienteAdmin();
      const creado = await admin.workspaces.crear.mutate({ nombre: 'Acme Corp' });

      // En el workspace por defecto (donde arranca el admin): crea un rol "Editor".
      const rolDefault = await admin.roles.guardar.mutate({
        id: '', nombre: 'Editor', ambito: 'general', permisos: [], esSistema: false, workspaceId: '', creadoEn: '', actualizadoEn: ''
      });
      const rolesDefaultAntes = await admin.roles.listar.query();
      expect(rolesDefaultAntes.some((r) => r.id === rolDefault.id)).toBe(true);

      // Cambia al workspace nuevo — vacío, no ve el rol "Editor" del otro.
      await admin.workspaces.cambiarActual.mutate({ workspaceId: creado.id });
      const rolesNuevoAntes = await admin.roles.listar.query();
      expect(rolesNuevoAntes.some((r) => r.id === rolDefault.id)).toBe(false);

      // Puede crear un rol con el MISMO nombre "Editor" sin colisión — es un catálogo distinto.
      const rolNuevo = await admin.roles.guardar.mutate({
        id: '', nombre: 'Editor', ambito: 'general', permisos: [], esSistema: false, workspaceId: '', creadoEn: '', actualizadoEn: ''
      });
      expect(rolNuevo.id).not.toBe(rolDefault.id);
      const rolesNuevoDespues = await admin.roles.listar.query();
      expect(rolesNuevoDespues.filter((r) => r.nombre === 'Editor')).toHaveLength(1);

      // De vuelta al workspace por defecto: sigue viendo solo SU "Editor", no el del otro.
      await admin.workspaces.cambiarActual.mutate({ workspaceId: 'workspace-default' });
      const rolesDefaultDespues = await admin.roles.listar.query();
      expect(rolesDefaultDespues.filter((r) => r.nombre === 'Editor')).toHaveLength(1);
      expect(rolesDefaultDespues.find((r) => r.nombre === 'Editor')?.id).toBe(rolDefault.id);
    }
  );

  it('un usuario sin ningún permiso global recibe FORBIDDEN al intentar crear un workspace', async () => {
    const admin = await clienteAdmin();
    await admin.usuarios.crear.mutate({ nombreUsuario: 'sinpermisos', nombreCompleto: 'Sin Permisos', password: 'contrasenaSegura1' });

    const cliente = crearCliente(fetchConCookies());
    await cliente.auth.login.mutate({ nombreUsuario: 'sinpermisos', password: 'contrasenaSegura1' });
    const error = await cliente.workspaces.crear.mutate({ nombre: 'No debería crearse' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TRPCClientError);
    expect((error as TRPCClientError<AppRouter>).data?.code).toBe('FORBIDDEN');
  });
});

describe('Roles globales — CRUD', () => {
  it('"Super administrador" existe, con todos los permisos globales, y no se puede eliminar (rol del sistema)', async () => {
    const admin = await clienteAdmin();
    const items = await admin.rolesGlobales.listar.query();
    const superAdmin = items.find((r) => r.id === 'rol-global-super-administrador');
    expect(superAdmin).toBeDefined();
    expect(superAdmin?.esSistema).toBe(true);

    await expect(admin.rolesGlobales.eliminar.mutate({ id: 'rol-global-super-administrador' })).rejects.toMatchObject({
      message: expect.stringContaining('sistema')
    });
  });

  it('crea un rol global personalizado, se lo asigna a un usuario, y ese usuario puede entonces crear workspaces', async () => {
    const admin = await clienteAdmin();
    const rol = await admin.rolesGlobales.guardar.mutate({
      id: '', nombre: 'Creador de workspaces', permisos: ['workspaces.crear'], esSistema: false, creadoEn: '', actualizadoEn: ''
    });

    const usuario = await admin.usuarios.crear.mutate({ nombreUsuario: 'creador', nombreCompleto: 'Creador', password: 'contrasenaSegura1' });
    await admin.usuarios.establecerRolGlobal.mutate({ id: usuario.id, rolGlobalId: rol.id });

    const cliente = crearCliente(fetchConCookies());
    await cliente.auth.login.mutate({ nombreUsuario: 'creador', password: 'contrasenaSegura1' });
    const identidad = await cliente.auth.yo.query();
    expect(identidad?.permisos.global).toEqual(['workspaces.crear']);

    const creado = await cliente.workspaces.crear.mutate({ nombre: 'Workspace de Creador' });
    expect(creado.nombre).toBe('Workspace de Creador');

    // Pero NO puede eliminarlo — solo tiene el permiso de crear, no de eliminar.
    const error = await cliente.workspaces.eliminar.mutate({ id: creado.id }).catch((e: unknown) => e);
    expect((error as TRPCClientError<AppRouter>).data?.code).toBe('FORBIDDEN');
  });
});
