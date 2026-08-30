import type { IClock, INotificadorEmail, IUsuarioRepository } from '@application/ports/index';
import type { FilaTablero } from '@application/use-cases/ServicioSeguimiento';
import { indicadoresQueRequierenNotificacion } from './DetectorVencimientos';

/**
 * Solo la porción de `ServicioSeguimiento` que este job necesita — evita
 * depender de la clase concreta (y de sus ~9 repositorios) para poder
 * probarlo con un stub trivial; `ServicioSeguimiento` la implementa tal
 * cual, sin adaptador.
 */
export interface FuenteTablero {
  tablero(): Promise<FilaTablero[]>;
}

export interface ResultadoNotificacionesVencimiento {
  enviadas: number;
  /** Detectados pero no enviados: ya notificados hoy, sin responsable puntual, o el responsable no tiene correo. */
  omitidas: number;
}

/**
 * Job de notificaciones proactivas de vencimiento (reemplaza el
 * `Notification` nativo de Electron / `setInterval` cada hora que existía en
 * la app de escritorio — ver `src/main/index.ts`, retirado en la Fase 4).
 * Decisiones confirmadas con el usuario (`AskUserQuestion`): canal = correo
 * vía SMTP (`INotificadorEmail`).
 *
 * Alcance del destinatario (decisión propia, documentada — no un vacío
 * silencioso): solo se notifica al RESPONSABLE PUNTUAL del indicador
 * (`FilaTablero.responsableId`), no a todo el equipo ni a quien tenga
 * permiso de categoría — es quien tiene la responsabilidad directa de
 * capturar el dato, y ya es a quien la regla del "responsable directo"
 * (`puedeSobreIndicador`) le da acceso de registro sin más. Un indicador
 * vinculado solo a un equipo (sin responsable puntual) no genera correo —
 * "avisar a todo el equipo" queda para una iteración futura si hace falta.
 *
 * `tablero()` se llama FUERA de `conPermisos` (ver `contextoUsuario.ts`) —
 * este job no corre dentro de una request de un usuario particular, así que
 * cae al contexto "sin restricción" y ve el tablero completo, que es
 * justo lo que necesita para barrer todos los indicadores del sistema.
 *
 * Deduplicación: en memoria, una entrada por `indicadorId:motivo` con la
 * fecha (yyyy-MM-dd) del último envío — si ya se notificó hoy, se omite.
 * No sobrevive un reinicio del proceso (aceptado: como mucho reenvía un
 * aviso el mismo día tras un restart, nunca dispara más de uno por
 * indicador+motivo+día en operación normal) — igual criterio de simplicidad
 * que `LimitadorIntentosLoginMemoria`.
 */
export class ServicioNotificacionesVencimiento {
  private readonly ultimoEnvioPorClave = new Map<string, string>();

  constructor(
    private readonly seguimiento: FuenteTablero,
    private readonly usuarios: IUsuarioRepository,
    private readonly notificador: INotificadorEmail,
    private readonly reloj: IClock,
    private readonly diasAnticipacion = 3
  ) {}

  async ejecutar(): Promise<ResultadoNotificacionesVencimiento> {
    const hoy = this.reloj.hoyIso();
    const filas = await this.seguimiento.tablero();
    const pendientes = indicadoresQueRequierenNotificacion(filas, hoy, this.diasAnticipacion);

    let enviadas = 0;
    let omitidas = 0;
    for (const n of pendientes) {
      const clave = `${n.indicadorId}:${n.motivo}`;
      if (this.ultimoEnvioPorClave.get(clave) === hoy) {
        omitidas++;
        continue;
      }
      const fila = filas.find((f) => f.indicadorId === n.indicadorId);
      const responsableId = fila?.responsableId ?? null;
      const usuario = responsableId ? await this.usuarios.obtener(responsableId) : null;
      if (!usuario?.correo) {
        omitidas++;
        continue;
      }

      await this.notificador.enviar({
        para: usuario.correo,
        asunto: n.motivo === 'Vencido'
          ? `KPITracker — Indicador vencido: ${n.nombre}`
          : `KPITracker — Indicador próximo a vencer: ${n.nombre}`,
        textoPlano: this.cuerpoCorreo(n, usuario.nombreCompleto)
      });
      this.ultimoEnvioPorClave.set(clave, hoy);
      enviadas++;
    }
    return { enviadas, omitidas };
  }

  private cuerpoCorreo(
    n: ReturnType<typeof indicadoresQueRequierenNotificacion>[number],
    nombreResponsable: string
  ): string {
    const linea = n.motivo === 'Vencido'
      ? `El indicador "${n.nombre}" está vencido${n.fechaLimite ? ` desde el ${n.fechaLimite}` : ''}.`
      : `El indicador "${n.nombre}" vence el ${n.fechaLimite ?? '(sin fecha)'}.`;
    return `Hola ${nombreResponsable},\n\n${linea}\n\nIngrese a KPITracker para registrar el resultado.\n`;
  }
}
