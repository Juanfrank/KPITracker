import { GeneradorPeriodos } from './GeneradorPeriodos';
import type { Meta } from '../entities/Meta';
import type { Periodo } from '../value-objects/Periodo';
import type { DefinicionPeriodicidad } from '../entities/DefinicionPeriodicidad';

const generador = new GeneradorPeriodos();

function diasEntre(desdeIso: string, hastaIso: string): number {
  return (Date.parse(hastaIso) - Date.parse(desdeIso)) / 86400000;
}

/**
 * La `Meta` vigente para un `período` concreto, entre las metas
 * configuradas de un indicador — para mostrar en Histórico "la meta
 * configurada por período, de existir" (en vez del único `metaGlobal`
 * escalar).
 *
 * Una meta puede fijarse a una periodicidad DISTINTA a la que el
 * indicador captura (p. ej. una meta Trimestral para un indicador
 * capturado Mensual: aplica igual a sus 3 meses). Por eso "vigente para
 * el período" no es una igualdad de id, sino contención de fechas: se
 * genera el propio calendario de la meta (su año + su
 * `periodicidadMedicion`) y se busca el segmento que contenga por
 * completo las fechas del período mostrado. Si varias metas calzan
 * (misma clave/año, distintas periodicidades encajadas), gana la de
 * segmento más angosto — la más específica; en empate de ancho, gana un
 * override de período puntual (`periodoId` fijado, ver "Configuración de
 * Metas") sobre una meta recurrente.
 *
 * `periodoId` (no nulo) restringe la meta a UN solo segmento de su propio
 * calendario (el que tiene ese id) en vez de a todos — sigue aplicando por
 * contención, así que un override Trimestral puntual igual se ve reflejado
 * en cada uno de sus 3 meses si el indicador captura Mensual.
 */
export function metaVigenteParaPeriodo(
  metas: readonly Meta[],
  claveDesagregacion: string,
  periodo: Periodo,
  definicionesPersonalizadas: ReadonlyMap<string, DefinicionPeriodicidad>
): Meta | null {
  const anio = Number(periodo.fechaInicio.slice(0, 4));
  const candidatas = metas.filter((m) => m.claveDesagregacion === claveDesagregacion && m.anioVigencia === anio);

  let mejor: { meta: Meta; duracionDias: number; esOverride: boolean } | null = null;
  for (const meta of candidatas) {
    const definicion = meta.periodicidadPersonalizadaId
      ? definicionesPersonalizadas.get(meta.periodicidadPersonalizadaId)
      : undefined;
    let segmentos: Periodo[];
    try {
      segmentos = generador.periodosDelAnio(meta.anioVigencia, meta.periodicidadMedicion, definicion);
    } catch {
      continue; // periodicidad Personalizada sin definición resoluble: esta meta no se puede ubicar en el calendario.
    }
    const segmentosAplicables = meta.periodoId ? segmentos.filter((s) => s.id === meta.periodoId) : segmentos;
    const segmento = segmentosAplicables.find((s) => s.fechaInicio <= periodo.fechaInicio && periodo.fechaFin <= s.fechaFin);
    if (!segmento) continue;
    const duracionDias = diasEntre(segmento.fechaInicio, segmento.fechaFin);
    const esOverride = meta.periodoId != null;
    const gana =
      !mejor ||
      duracionDias < mejor.duracionDias ||
      (duracionDias === mejor.duracionDias && esOverride && !mejor.esOverride);
    if (gana) mejor = { meta, duracionDias, esOverride };
  }
  return mejor?.meta ?? null;
}
