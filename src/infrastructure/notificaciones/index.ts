import type { INotificadorEmail } from '@application/ports/index';
import { NotificadorEmailDeshabilitado } from './NotificadorEmailDeshabilitado';
import { NotificadorEmailSmtp, leerConfiguracionSmtpDeEntorno } from './NotificadorEmailSmtp';

export { NotificadorEmailSmtp, leerConfiguracionSmtpDeEntorno } from './NotificadorEmailSmtp';
export { NotificadorEmailDeshabilitado } from './NotificadorEmailDeshabilitado';

/** `NotificadorEmailSmtp` si `SMTP_HOST` está configurado, si no `NotificadorEmailDeshabilitado` — ver docstrings de ambos. */
export function crearNotificadorEmail(env: NodeJS.ProcessEnv = process.env): INotificadorEmail {
  const config = leerConfiguracionSmtpDeEntorno(env);
  return config ? new NotificadorEmailSmtp(config) : new NotificadorEmailDeshabilitado();
}
