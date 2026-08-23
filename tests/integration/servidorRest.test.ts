import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
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

async function iniciarSesionAdmin(): Promise<void> {
  const cliente = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${baseUrl}/api/trpc`,
        fetch: async (input, init) => {
          const respuesta = await fetch(input, init);
          const setCookie = respuesta.headers.get('set-cookie');
          if (setCookie) cookieSesion = setCookie.split(';')[0] ?? null;
          return respuesta;
        }
      })
    ]
  });
  await cliente.auth.login.mutate({ nombreUsuario: 'admin', password: 'admin12345' });
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

    const formulario = new FormData();
    formulario.set('entidad', 'Levantamiento');
    formulario.set('entidadId', 'levantamiento-1');
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
