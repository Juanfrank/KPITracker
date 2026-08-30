import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import type { ParsedMail } from 'mailparser';
import type { AppRouter } from '../../src/server/trpc/appRouter';
import { crearApp } from '../../src/server/app';
import type { AppConstruida } from '../../src/server/app';

/**
 * Notificaciones proactivas de vencimiento — prueba de punta a punta: app
 * real (Knex + tRPC) creando un indicador vencido con un responsable de
 * correo conocido, corriendo `ServicioNotificacionesVencimiento.ejecutar()`
 * de verdad, contra un servidor SMTP de prueba LOCAL (no un proveedor
 * real — mismo criterio que `NotificadorEmailSmtp.test.ts`).
 */

let smtp: SMTPServer;
let puertoSmtp: number;
let recibidos: ParsedMail[];

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

async function clienteAdmin() {
  const cliente = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${baseUrl}/api/trpc`, fetch: fetchConCookies() })] });
  await cliente.auth.login.mutate({ nombreUsuario: 'admin', password: 'admin12345' });
  return cliente;
}

beforeEach(async () => {
  recibidos = [];
  smtp = new SMTPServer({
    secure: false,
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onData(stream, _session, callback) {
      simpleParser(stream)
        .then((parseado) => { recibidos.push(parseado); callback(); })
        .catch((error: unknown) => callback(error as Error));
    }
  });
  await new Promise<void>((resolve) => smtp.listen(0, '127.0.0.1', resolve));
  const direccionSmtp = smtp.server.address();
  puertoSmtp = direccionSmtp && typeof direccionSmtp === 'object' ? direccionSmtp.port : 0;

  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-notif-test-'));
  process.env.ADMIN_INICIAL_USUARIO = 'admin';
  process.env.ADMIN_INICIAL_PASSWORD = 'admin12345';
  // Apuntar el notificador real al SMTP de prueba, ANTES de construir la app (composicionServidor
  // lee estas variables una sola vez, al arrancar) — ver crearNotificadorEmail.
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(puertoSmtp);
  process.env.SMTP_FROM = 'KPITracker <no-reply@kpitracker.local>';

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
  await new Promise<void>((resolve) => smtp.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.ADMIN_INICIAL_USUARIO;
  delete process.env.ADMIN_INICIAL_PASSWORD;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_FROM;
});

describe('Notificaciones proactivas de vencimiento — punta a punta (Knex + tRPC + SMTP real de prueba)', () => {
  it('un indicador Mensual recién creado, sin captura, queda Vencido y le llega un correo real a su responsable', async () => {
    const admin = await clienteAdmin();

    await admin.usuarios.crear.mutate({
      nombreUsuario: 'responsable.correo', nombreCompleto: 'Responsable Con Correo', password: 'contrasenaSegura1',
      correo: 'responsable@example.com'
    });
    const responsable = (await admin.usuarios.listar.query()).find((u) => u.nombreUsuario === 'responsable.correo')!;

    await admin.indicadores.guardar.mutate({
      indicador: {
        id: '', codigo: 'NOTIF-1', nombre: 'Indicador para notificar', definicion: 'def', formaCalculo: null,
        periodicidad: 'Mensual', periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null,
        metaGlobal: null, desagregaciones: [], estado: 'Activo', responsable: responsable.id, categoria: null, equipo: null,
        unidadMedida: null, esCalculado: false, formula: null, creadoEn: '', actualizadoEn: ''
      },
      valores: []
    });

    const resultado = await construida.aplicacion.notificacionesVencimiento.ejecutar();
    expect(resultado.enviadas).toBeGreaterThanOrEqual(1);

    expect(recibidos.length).toBeGreaterThanOrEqual(1);
    const correo = recibidos.find((c) => c.subject?.includes('Indicador para notificar'));
    expect(correo).toBeDefined();
    const destinatario = Array.isArray(correo!.to) ? correo!.to[0] : correo!.to;
    expect(destinatario?.text).toContain('responsable@example.com');
    expect(correo!.text).toContain('vencido');
  });

  it('correr el job dos veces seguidas no manda un segundo correo por el mismo indicador (deduplicado por día)', async () => {
    const admin = await clienteAdmin();
    await admin.usuarios.crear.mutate({
      nombreUsuario: 'otro.responsable', nombreCompleto: 'Otro Responsable', password: 'contrasenaSegura1',
      correo: 'otro@example.com'
    });
    const responsable = (await admin.usuarios.listar.query()).find((u) => u.nombreUsuario === 'otro.responsable')!;
    await admin.indicadores.guardar.mutate({
      indicador: {
        id: '', codigo: 'NOTIF-2', nombre: 'Otro indicador para notificar', definicion: 'def', formaCalculo: null,
        periodicidad: 'Mensual', periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null,
        metaGlobal: null, desagregaciones: [], estado: 'Activo', responsable: responsable.id, categoria: null, equipo: null,
        unidadMedida: null, esCalculado: false, formula: null, creadoEn: '', actualizadoEn: ''
      },
      valores: []
    });

    await construida.aplicacion.notificacionesVencimiento.ejecutar();
    const cantidadTrasPrimera = recibidos.length;
    const segunda = await construida.aplicacion.notificacionesVencimiento.ejecutar();

    expect(segunda.enviadas).toBe(0);
    expect(recibidos.length).toBe(cantidadTrasPrimera); // ningún correo nuevo
  });
});
