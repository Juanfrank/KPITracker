import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import type { ParsedMail } from 'mailparser';
import {
  NotificadorEmailDeshabilitado, NotificadorEmailSmtp, leerConfiguracionSmtpDeEntorno
} from '@infrastructure/notificaciones/index';

/**
 * Verifica el mecanismo SMTP real contra un servidor de prueba LOCAL (no
 * un proveedor real — este sandbox no tiene credenciales de un proveedor
 * de correo real) — mismo criterio que la Fase 2b validó Knex↔SQL Server
 * contra un contenedor real en vez de solo confiar en SQLite: probar la
 * implementación de verdad (protocolo SMTP, `nodemailer`), no solo la
 * lógica que la envuelve.
 */
let servidor: SMTPServer;
let puerto: number;
let recibidos: ParsedMail[];

beforeEach(async () => {
  recibidos = [];
  servidor = new SMTPServer({
    secure: false,
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onData(stream, _session, callback) {
      simpleParser(stream)
        .then((parseado) => { recibidos.push(parseado); callback(); })
        .catch((error: unknown) => callback(error as Error));
    }
  });
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const direccion = servidor.server.address();
  puerto = direccion && typeof direccion === 'object' ? direccion.port : 0;
});

afterEach(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});

describe('NotificadorEmailSmtp', () => {
  it('entrega un correo real (asunto + cuerpo + destinatario) a un servidor SMTP de prueba', async () => {
    const notificador = new NotificadorEmailSmtp({
      host: '127.0.0.1', port: puerto, secure: false, remitente: 'KPITracker <no-reply@kpitracker.local>'
    });

    await notificador.enviar({
      para: 'responsable@example.com',
      asunto: 'KPITracker — Indicador vencido: Cobertura de vacunación',
      textoPlano: 'Hola Ana,\n\nEl indicador "Cobertura de vacunación" está vencido.\n'
    });

    expect(recibidos).toHaveLength(1);
    const correo = recibidos[0]!;
    expect(correo.subject).toBe('KPITracker — Indicador vencido: Cobertura de vacunación');
    expect(correo.text).toContain('Cobertura de vacunación');
    const destinatario = Array.isArray(correo.to) ? correo.to[0] : correo.to;
    expect(destinatario?.text).toContain('responsable@example.com');
    expect(correo.from?.text).toContain('no-reply@kpitracker.local');
  });

  it('rechaza (rebota la promesa) si el servidor SMTP no es alcanzable', async () => {
    const notificador = new NotificadorEmailSmtp({ host: '127.0.0.1', port: 1, secure: false, remitente: 'no-reply@kpitracker.local' });
    await expect(notificador.enviar({ para: 'x@example.com', asunto: 'x', textoPlano: 'x' })).rejects.toThrow();
  });
});

describe('leerConfiguracionSmtpDeEntorno', () => {
  it('null cuando SMTP_HOST no está seteado — el llamador cae a NotificadorEmailDeshabilitado', () => {
    expect(leerConfiguracionSmtpDeEntorno({})).toBeNull();
  });

  it('lee host/puerto/secure/usuario/remitente de las variables de entorno, con defaults razonables', () => {
    const config = leerConfiguracionSmtpDeEntorno({ SMTP_HOST: 'smtp.ejemplo.com', SMTP_USER: 'u', SMTP_PASSWORD: 'p' });
    expect(config).toEqual({
      host: 'smtp.ejemplo.com', port: 587, secure: false, usuario: 'u', password: 'p',
      remitente: 'KPITracker <no-reply@kpitracker.local>'
    });
  });

  it('SMTP_SECURE=true y SMTP_FROM personalizado se respetan', () => {
    const config = leerConfiguracionSmtpDeEntorno({
      SMTP_HOST: 'smtp.ejemplo.com', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_FROM: 'Alertas <alertas@empresa.com>'
    });
    expect(config?.port).toBe(465);
    expect(config?.secure).toBe(true);
    expect(config?.remitente).toBe('Alertas <alertas@empresa.com>');
  });
});

describe('NotificadorEmailDeshabilitado', () => {
  it('no lanza y avisa por consola una sola vez, aunque se llame varias veces', async () => {
    const avisos: unknown[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => avisos.push(args);
    try {
      const notificador = new NotificadorEmailDeshabilitado();
      await notificador.enviar({ para: 'x@example.com', asunto: 'x', textoPlano: 'x' });
      await notificador.enviar({ para: 'y@example.com', asunto: 'y', textoPlano: 'y' });
      expect(avisos).toHaveLength(1);
    } finally {
      console.warn = originalWarn;
    }
  });
});
