import type { CorreoAEnviar, INotificadorEmail } from '@application/ports/index';

/**
 * No-op de `INotificadorEmail` usado cuando `SMTP_HOST` no está configurado
 * (ver `leerConfiguracionSmtpDeEntorno`) — el servidor arranca igual y el
 * job de notificaciones de vencimiento sigue corriendo (calcula quién
 * debería notificarse), solo que no envía nada; avisa por consola UNA sola
 * vez para no inundar el log en cada corrida del job.
 */
export class NotificadorEmailDeshabilitado implements INotificadorEmail {
  private avisado = false;

  async enviar(_correo: CorreoAEnviar): Promise<void> {
    if (!this.avisado) {
      console.warn(
        '[KPITracker] SMTP no configurado (falta SMTP_HOST) — las notificaciones de vencimiento por correo están deshabilitadas.'
      );
      this.avisado = true;
    }
  }
}
