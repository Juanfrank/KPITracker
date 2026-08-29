import type { TipoAgregacion } from '../services/AgregacionMedicion';

/**
 * Corte de medición (Batch Y, pedido explícito del usuario): "un momento
 * global donde se hace el corte de los datos para fines de reportería y
 * medición". Al calcularlo (`ServicioCortesMedicion.calcular`), cada
 * indicador visible agrega sus períodos cerrados desde el corte
 * cronológicamente anterior (o desde el inicio, si es el primero) hasta
 * `fecha`, usando `reglaGeneral` — salvo que tenga una entrada en
 * `reglasPorIndicador`, que la reemplaza para ESE indicador únicamente.
 */
export interface CorteMedicion {
  readonly id: string;
  nombre: string;
  /** Fecha del corte, ISO `yyyy-MM-dd` — se agregan los períodos con cierre hasta este día inclusive. */
  fecha: string;
  reglaGeneral: TipoAgregacion;
  /** indicadorId → regla que reemplaza a `reglaGeneral` únicamente para ese indicador. */
  reglasPorIndicador: Record<string, TipoAgregacion>;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/** Un indicador ya agregado hasta un corte — lo que devuelve `ServicioCortesMedicion.calcular`. */
export interface ResultadoCorteMedicion {
  indicadorId: string;
  nombre: string;
  regla: TipoAgregacion;
  /** `null` si el indicador no tiene ningún período con datos dentro de la ventana del corte. */
  valorAgregado: number | null;
  /** Cantidad de períodos que entraron en la agregación (con o sin valor capturado). */
  periodosConsiderados: number;
}
