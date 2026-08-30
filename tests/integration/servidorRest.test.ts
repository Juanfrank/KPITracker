import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { TRPCClientError } from '@trpc/client';
import { ID_CATEGORIA_GENERAL, ID_EQUIPO_GENERAL } from '@domain/index';
import type { AppRouter } from '../../src/server/trpc/appRouter';
import { crearApp } from '../../src/server/app';
import type { AppConstruida } from '../../src/server/app';

/**
 * Rutas REST (fuera de tRPC): archivos y flujos binarios — ver plan §5.
 * Comparten la misma cookie de sesión firmada que tRPC (`requireAuth`, ver
 * `src/server/rest/authMiddleware.ts`), así que cada test inicia sesión vía
 * el router `auth` y reutiliza la cookie capturada en las peticiones REST.
 */

let dataDir: string;
let construida: AppConstruida;
let servidor: Server;
let baseUrl: string;
let cookieSesion: string | null;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-server-rest-test-'));
  process.env.ADMIN_INICIAL_USUARIO = 'admin';
  process.env.ADMIN_INICIAL_PASSWORD = 'admin12345';
  cookieSesion = null;

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

/** Cliente tRPC que reenvía la cookie ya capturada en cada request y actualiza `cookieRef` con cualquier Set-Cookie nueva — suficiente para login + llamadas subsiguientes con la misma sesión, sin un cookie-jar real (Node `fetch` no trae uno). */
function clienteTrpc(cookieRef: { valor: string | null }) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/api/trpc`,
        fetch: async (input, init) => {
          const headers = new Headers(init?.headers);
          if (cookieRef.valor) headers.set('cookie', cookieRef.valor);
          const respuesta = await fetch(input, { ...init, headers });
          const setCookie = respuesta.headers.get('set-cookie');
          if (setCookie) cookieRef.valor = setCookie.split(';')[0] ?? null;
          return respuesta;
        }
      })
    ]
  });
}

async function iniciarSesionAdmin(): Promise<void> {
  const ref = { valor: null as string | null };
  const cliente = clienteTrpc(ref);
  await cliente.auth.login.mutate({ nombreUsuario: 'admin', password: 'admin12345' });
  cookieSesion = ref.valor;
}

/** Crea (como admin) un usuario SIN rol/permiso alguno y devuelve la cookie de SU propia sesión, ya autenticada. */
async function crearUsuarioSinPermisosYLoguearse(nombreUsuario: string): Promise<string> {
  const refAdmin = { valor: null as string | null };
  const clienteAdmin = clienteTrpc(refAdmin);
  await clienteAdmin.auth.login.mutate({ nombreUsuario: 'admin', password: 'admin12345' });
  await clienteAdmin.usuarios.crear.mutate({ nombreUsuario, nombreCompleto: nombreUsuario, password: 'sinPermisos123' });

  const refUsuario = { valor: null as string | null };
  const clienteUsuario = clienteTrpc(refUsuario);
  await clienteUsuario.auth.login.mutate({ nombreUsuario, password: 'sinPermisos123' });
  return refUsuario.valor!;
}

async function codigoError(promesa: Promise<unknown>): Promise<string | undefined> {
  try {
    await promesa;
    return undefined;
  } catch (error) {
    return (error as TRPCClientError<AppRouter>).data?.code;
  }
}

/** Crea (como admin, ya logueado) un indicador real en el equipo/categoría "General" y devuelve `"<indicadorId>:<periodoId>"` — la clave compuesta que espera `Adjunto.entidadId` (ver `ServicioAdjuntos`). */
async function crearLevantamiento(clienteAdmin: ReturnType<typeof clienteTrpc>, codigo: string): Promise<{ indicadorId: string; entidadId: string }> {
  const indicador = await clienteAdmin.indicadores.guardar.mutate({
    indicador: {
      id: '', codigo, nombre: `Indicador ${codigo}`, definicion: 'def', formaCalculo: null,
      periodicidad: 'Mensual', periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null,
      metaGlobal: null, desagregaciones: [], estado: 'Activo', responsable: null,
      categoria: ID_CATEGORIA_GENERAL, equipo: ID_EQUIPO_GENERAL,
      unidadMedida: null, esCalculado: false, formula: null, creadoEn: '', actualizadoEn: ''
    } as never,
    valores: []
  }) as { id: string };
  const periodos = await clienteAdmin.recoleccion.periodos.query({ indicadorId: indicador.id });
  return { indicadorId: indicador.id, entidadId: `${indicador.id}:${periodos[0]!.id}` };
}

describe('Rutas REST — autenticación compartida con tRPC', () => {
  it('responde 401 sin cookie de sesión en cada prefijo', async () => {
    for (const ruta of ['/api/adjuntos/x/descarga', '/api/importacion/hoja-calculo', '/api/respaldo/exportar', '/api/portable/exportar']) {
      const respuesta = await fetch(`${baseUrl}${ruta}`);
      expect(respuesta.status, ruta).toBe(401);
    }
  });
});

describe('Rutas REST — /api/portable', () => {
  it('exporta e importa la configuración portable de punta a punta', async () => {
    await iniciarSesionAdmin();

    const exportado = await fetch(`${baseUrl}/api/portable/exportar`, { headers: { cookie: cookieSesion! } });
    expect(exportado.status).toBe(200);
    const json = await exportado.text();
    expect(JSON.parse(json)).toMatchObject({ formato: 'kpitracker-config' });

    const importado = await fetch(`${baseUrl}/api/portable/importar`, {
      method: 'POST',
      headers: { cookie: cookieSesion!, 'content-type': 'application/json' },
      body: json
    });
    expect(importado.status).toBe(200);
    expect(await importado.json()).toMatchObject({ advertencias: expect.any(Array) });
  });
});

describe('Rutas REST — /api/adjuntos', () => {
  it('sube un archivo (multipart) y lo descarga de vuelta con el mismo contenido', async () => {
    await iniciarSesionAdmin();
    const admin = clienteTrpc({ valor: cookieSesion });
    const { entidadId } = await crearLevantamiento(admin, 'ADJ-1');

    const formulario = new FormData();
    formulario.set('entidad', 'Levantamiento');
    formulario.set('entidadId', entidadId);
    formulario.set('comentario', 'Evidencia de prueba');
    formulario.set('archivo', new Blob(['contenido de prueba'], { type: 'text/plain' }), 'evidencia.txt');

    const subida = await fetch(`${baseUrl}/api/adjuntos`, {
      method: 'POST',
      headers: { cookie: cookieSesion! },
      body: formulario
    });
    expect(subida.status).toBe(201);
    const adjunto = (await subida.json()) as { id: string; nombreArchivo: string };
    expect(adjunto.nombreArchivo).toBe('evidencia.txt');

    const descarga = await fetch(`${baseUrl}/api/adjuntos/${adjunto.id}/descarga`, { headers: { cookie: cookieSesion! } });
    expect(descarga.status).toBe(200);
    expect(await descarga.text()).toBe('contenido de prueba');
  });

  it('rechaza un tipo de archivo fuera de la lista blanca (audit de seguridad, LOW-2)', async () => {
    await iniciarSesionAdmin();
    const admin = clienteTrpc({ valor: cookieSesion });
    const { entidadId } = await crearLevantamiento(admin, 'ADJ-3');

    const formulario = new FormData();
    formulario.set('entidad', 'Levantamiento');
    formulario.set('entidadId', entidadId);
    formulario.set('archivo', new Blob(['#!/bin/sh\necho hola']), 'script.sh');

    const subida = await fetch(`${baseUrl}/api/adjuntos`, { method: 'POST', headers: { cookie: cookieSesion! }, body: formulario });
    expect(subida.status).toBe(400);
    expect((await subida.json()) as { error: string }).toMatchObject({ error: expect.stringContaining('script.sh') });
  });
});

describe('Rutas REST/tRPC — adjuntos exigen permiso sobre el indicador del levantamiento (audit de seguridad, HIGH-1)', () => {
  it('un usuario sin ningún permiso sobre el indicador no puede listar, subir, descargar ni eliminar sus adjuntos, aunque conozca los ids', async () => {
    await iniciarSesionAdmin();
    const admin = clienteTrpc({ valor: cookieSesion });
    const { entidadId } = await crearLevantamiento(admin, 'ADJ-2');

    const formularioAdmin = new FormData();
    formularioAdmin.set('entidad', 'Levantamiento');
    formularioAdmin.set('entidadId', entidadId);
    formularioAdmin.set('archivo', new Blob(['evidencia admin']), 'evidencia.txt');
    const subidaAdmin = await fetch(`${baseUrl}/api/adjuntos`, {
      method: 'POST', headers: { cookie: cookieSesion! }, body: formularioAdmin
    });
    expect(subidaAdmin.status).toBe(201);
    const adjuntoAdmin = (await subidaAdmin.json()) as { id: string };

    const cookieSinPermisos = await crearUsuarioSinPermisosYLoguearse('sin.permisos.adjuntos');
    const clienteSinPermisos = clienteTrpc({ valor: cookieSinPermisos });

    // tRPC: listar/eliminar — antes del fix, cualquier sesión válida podía hacer esto.
    expect(await codigoError(clienteSinPermisos.adjuntos.listar.query({ entidad: 'Levantamiento', entidadId }))).toBe('BAD_REQUEST');
    expect(await codigoError(clienteSinPermisos.adjuntos.eliminar.mutate({ id: adjuntoAdmin.id }))).toBe('BAD_REQUEST');

    // REST: descargar — antes del fix, leía el repo crudo sin ningún chequeo de permiso.
    const descargaRechazada = await fetch(`${baseUrl}/api/adjuntos/${adjuntoAdmin.id}/descarga`, { headers: { cookie: cookieSinPermisos } });
    expect(descargaRechazada.status).toBe(400);

    // REST: subir — antes del fix, cualquier sesión válida podía adjuntar evidencia a CUALQUIER indicador.
    const formularioIntruso = new FormData();
    formularioIntruso.set('entidad', 'Levantamiento');
    formularioIntruso.set('entidadId', entidadId);
    formularioIntruso.set('archivo', new Blob(['intento ajeno']), 'intento.txt');
    const subidaRechazada = await fetch(`${baseUrl}/api/adjuntos`, {
      method: 'POST', headers: { cookie: cookieSinPermisos }, body: formularioIntruso
    });
    expect(subidaRechazada.status).toBe(400);

    // El adjunto original del admin sigue intacto y descargable — la denegación fue del usuario, no del recurso.
    const descargaAdmin = await fetch(`${baseUrl}/api/adjuntos/${adjuntoAdmin.id}/descarga`, { headers: { cookie: cookieSesion! } });
    expect(descargaAdmin.status).toBe(200);
  });
});

describe('Rutas REST — /api/respaldo', () => {
  it('exporta, previsualiza (leer) e importa selectivamente de punta a punta', async () => {
    await iniciarSesionAdmin();

    const exportado = await fetch(`${baseUrl}/api/respaldo/exportar`, { headers: { cookie: cookieSesion! } });
    expect(exportado.status).toBe(200);
    const json = await exportado.text();

    const formularioLeer = new FormData();
    formularioLeer.set('archivo', new Blob([json], { type: 'application/json' }), 'respaldo.json');
    const leido = await fetch(`${baseUrl}/api/respaldo/leer`, { method: 'POST', headers: { cookie: cookieSesion! }, body: formularioLeer });
    expect(leido.status).toBe(200);
    const resumen = (await leido.json()) as { categorias: { categoria: string }[] };
    expect(resumen.categorias.some((c) => c.categoria === 'configuracionGeneral')).toBe(true);

    const formularioImportar = new FormData();
    formularioImportar.set('archivo', new Blob([json], { type: 'application/json' }), 'respaldo.json');
    formularioImportar.set('seleccion', JSON.stringify({ configuracionGeneral: true }));
    const importado = await fetch(`${baseUrl}/api/respaldo/importar`, { method: 'POST', headers: { cookie: cookieSesion! }, body: formularioImportar });
    expect(importado.status).toBe(200);
    expect(await importado.json()).toMatchObject({ importados: { configuracionGeneral: 1 } });
  });
});

describe('Rutas REST — /api/respaldo y /api/portable exigen respaldo.importarExportar (Batch X, X7)', () => {
  it('un usuario sin ese permiso recibe 403 en export/leer/importar de ambos prefijos', async () => {
    const cookieUsuario = await crearUsuarioSinPermisosYLoguearse('sin.permiso.respaldo');

    const exportadoRespaldo = await fetch(`${baseUrl}/api/respaldo/exportar`, { headers: { cookie: cookieUsuario } });
    expect(exportadoRespaldo.status).toBe(403);

    const exportadoPortable = await fetch(`${baseUrl}/api/portable/exportar`, { headers: { cookie: cookieUsuario } });
    expect(exportadoPortable.status).toBe(403);

    const formulario = new FormData();
    formulario.set('archivo', new Blob(['{}'], { type: 'application/json' }), 'x.json');
    const leido = await fetch(`${baseUrl}/api/respaldo/leer`, { method: 'POST', headers: { cookie: cookieUsuario }, body: formulario });
    expect(leido.status).toBe(403);
  });

  it('el administrador (esAdministrador=true) sigue pudiendo exportar sin necesitar el permiso puntual', async () => {
    await iniciarSesionAdmin();
    const exportado = await fetch(`${baseUrl}/api/respaldo/exportar`, { headers: { cookie: cookieSesion! } });
    expect(exportado.status).toBe(200);
  });
});

describe('Rutas REST — /api/importacion', () => {
  it('lee un CSV subido y devuelve columnas + filas', async () => {
    await iniciarSesionAdmin();

    const formulario = new FormData();
    formulario.set('archivo', new Blob(['nombre,codigo\nUno,U1\nDos,U2\n'], { type: 'text/csv' }), 'datos.csv');

    const respuesta = await fetch(`${baseUrl}/api/importacion/hoja-calculo`, { method: 'POST', headers: { cookie: cookieSesion! }, body: formulario });
    expect(respuesta.status).toBe(200);
    const resultado = (await respuesta.json()) as { columnas: string[]; filas: Record<string, string>[] };
    expect(resultado.columnas).toEqual(['nombre', 'codigo']);
    expect(resultado.filas).toEqual([
      { nombre: 'Uno', codigo: 'U1' },
      { nombre: 'Dos', codigo: 'U2' }
    ]);
  });
});

describe('Cabeceras de hardening (audit de seguridad, MEDIUM)', () => {
  it('toda respuesta (API incluida) trae CSP/X-Frame-Options/X-Content-Type-Options/Referrer-Policy', async () => {
    const respuesta = await fetch(`${baseUrl}/api/adjuntos/x/descarga`); // 401 sin cookie — igual debe traer las cabeceras
    expect(respuesta.headers.get('x-frame-options')).toBe('DENY');
    expect(respuesta.headers.get('x-content-type-options')).toBe('nosniff');
    expect(respuesta.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    const csp = respuesta.headers.get('content-security-policy');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(respuesta.headers.get('x-powered-by')).toBeNull();
  });
});
