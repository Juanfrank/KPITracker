import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { CorreoAEnviar, INotificadorEmail } from '@application/ports/index';

export interface ConfiguracionSmtp {
  host: string;
  port: number;
  secure: boolean;
  usuario?: string;
  password?: string;
  remitente: string;
}

/**
 * Implementación real de `INotificadorEmail` — SMTP genérico vía
 * `nodemailer` (elegido sobre webhook, ver `AskUserQuestion` de esta
 * sesión). Configuración por variables de entorno (`crearNotificadorEmail`,
 * abajo), mismo criterio que `DB_CLIENT`/`mssql` en `knexInstance.ts`: un
 * único punto de lectura de env vars, la implementación en sí recibe la
 * configuración ya resuelta y no conoce `process.env`.
 */
export class NotificadorEmailSmtp implements INotificadorEmail {
  private readonly transportador: Transporter;

  constructor(private readonly config: ConfiguracionSmtp) {
    this.transportador = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.usuario ? { user: config.usuario, pass: config.password } : undefined
    });
  }

  async enviar(correo: CorreoAEnviar): Promise<void> {
    await this.transportador.sendMail({
      from: this.config.remitente,
      to: correo.para,
      subject: correo.asunto,
      text: correo.textoPlano
    });
  }
}

/**
 * Lee `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASSWORD`/
 * `SMTP_FROM` y arma la configuración de `NotificadorEmailSmtp` — `null` si
 * `SMTP_HOST` no está seteado (el llamador cae entonces a
 * `NotificadorEmailDeshabilitado`, ver ese archivo).
 */
export function leerConfiguracionSmtpDeEntorno(env: NodeJS.ProcessEnv = process.env): ConfiguracionSmtp | null {
  const host = env.SMTP_HOST;
  if (!host) return null;
  return {
    host,
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE === 'true',
    usuario: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    remitente: env.SMTP_FROM ?? 'KPITracker <no-reply@kpitracker.local>'
  };
}
