import { Periodicidad } from '../value-objects/Periodicidad';
import type { TipoAgregacion } from '../services/AgregacionMedicion';

/**
 * Periodicidades válidas para un corte de medición (pedido explícito del
 * usuario, Batch AA): siempre SUPERIOR al mes — nunca Mensual (sería
 * redundante con los propios períodos del indicador) ni Personalizada (sin
 * una ventana calendario fija que agrupar). Cada período de esta
 * periodicidad ("T1 2026", "S1 2026"...) es un "bucket" que agrega los
 * períodos más finos del indicador cuya ventana cae dentro de la suya.
 */
export const PERIODICIDADES_CORTE: readonly Periodicidad[] = [
  Periodicidad.Bimestral, Periodicidad.Trimestral, Periodicidad.Cuatrimestral, Periodicidad.Semestral, Periodicidad.Anual
];

export function periodicidadCorteValida(p: string): p is Periodicidad {
  return (PERIODICIDADES_CORTE as readonly string[]).includes(p);
}

/**
 * Corte de medición (Batch Y, pedido explícito del usuario: "un momento
 * global donde se hace el corte de los datos para fines de reportería y
 * medición"; rediseñado en Batch AA a pedido explícito del usuario: en vez
 * de una fecha puntual, el corte es una PERIODICIDAD recurrente superior al
 * mes — cada uno de sus períodos ("T1 2026", "T2 2026"...) es un bucket que
 * agrega, con `reglaGeneral` (salvo excepción en `reglasPorIndicador`), los
 * períodos más finos del indicador cuya ventana cae dentro de la suya. Ver
 * `ServicioCortesMedicion.calcular`.
 */
export interface CorteMedicion {
  readonly id: string;
  nombre: string;
  /** Siempre uno de `PERIODICIDADES_CORTE` (Bimestral..Anual). */
  periodicidad: Periodicidad;
  reglaGeneral: TipoAgregacion;
  /** indicadorId → regla que reemplaza a `reglaGeneral` únicamente para ese indicador. */
  reglasPorIndicador: Record<string, TipoAgregacion>;
  /** Si `true` (default), los períodos sin Meta configurada se EXCLUYEN por completo de la agregación (no solo se despesan, como ya hace `promedioPonderado`). */
  omitirPeriodosSinMeta: boolean;
  /**
   * Si `true` (default), cada resultado PARTICIPANTE de la agregación (el %
   * de cumplimiento de cada período que entra al bucket, ver
   * `ServicioCortesMedicion.calcular`) se acota a un máximo de 100 ANTES de
   * agregarse — no el valor ya agregado del bucket. Pensado para indicadores
   * medidos como porcentaje, donde un sobre-cumplimiento puntual no debería
   * "arrastrar hacia arriba" el resultado combinado de los demás períodos.
   */
  acotarAl100: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/** Un indicador agregado dentro de UN bucket de un corte — lo que devuelve `ServicioCortesMedicion.calcular` (una fila por indicador × bucket con datos). */
export interface ResultadoCorteMedicion {
  indicadorId: string;
  nombre: string;
  regla: TipoAgregacion;
  /** Id del período-bucket del corte (p. ej. "2026-Trimestral-01"). */
  periodoId: string;
  /** Etiqueta legible del bucket (p. ej. "T1 2026"). */
  periodoEtiqueta: string;
  /** `null` si, tras aplicar `omitirPeriodosSinMeta`, no quedó ningún período con valor dentro de este bucket. */
  valorAgregado: number | null;
  /** Cantidad de períodos que entraron en la agregación de este bucket (con valor, y con meta si `omitirPeriodosSinMeta`). */
  periodosConsiderados: number;
}
