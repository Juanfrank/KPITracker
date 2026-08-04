import type { FilaTablero } from '@application/use-cases/ServicioSeguimiento';

export type MotivoNotificacion = 'Vencido' | 'ProximoAVencer';

export interface NotificacionVencimiento {
  indicadorId: string;
  nombre: string;
  motivo: MotivoNotificacion;
  fechaLimite: string | null;
}

/**
 * Función pura: dado el tablero de seguimiento y la fecha de hoy, decide
 * qué indicadores requieren notificarse — vencidos, o con fecha límite
 * dentro de los próximos `diasAnticipacion` días. Sin efectos secundarios
 * (no dispara notificaciones ni conoce Electron); el llamador decide cómo
 * presentarlas y cómo deduplicar entre corridas.
 */
export function indicadoresQueRequierenNotificacion(
  filas: FilaTablero[],
  hoyIso: string,
  diasAnticipacion = 3
): NotificacionVencimiento[] {
  const hoy = new Date(hoyIso);
  const resultado: NotificacionVencimiento[] = [];

  for (const fila of filas) {
    if (fila.estado === 'Vencido') {
      resultado.push({ indicadorId: fila.indicadorId, nombre: fila.nombre, motivo: 'Vencido', fechaLimite: fila.fechaLimite });
      continue;
    }
    if ((fila.estado === 'Pendiente' || fila.estado === 'EnProgreso') && fila.fechaLimite) {
      const limite = new Date(fila.fechaLimite);
      const diasRestantes = Math.floor((limite.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
      if (diasRestantes >= 0 && diasRestantes <= diasAnticipacion) {
        resultado.push({ indicadorId: fila.indicadorId, nombre: fila.nombre, motivo: 'ProximoAVencer', fechaLimite: fila.fechaLimite });
      }
    }
  }

  return resultado;
}
