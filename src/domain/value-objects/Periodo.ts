import { Periodicidad, infoPeriodicidad, NOMBRES_MES } from './Periodicidad';
import type { DefinicionPeriodicidad } from '../entities/DefinicionPeriodicidad';

/**
 * Período concreto de medición: una periodicidad, un año y el número ordinal
 * del período dentro del año (1..n). Value object inmutable.
 */
export interface Periodo {
  readonly anio: number;
  readonly periodicidad: Periodicidad;
  /** Ordinal 1..periodosPorAnio. */
  readonly numero: number;
  /** Etiqueta legible: "Enero 2025", "T1 2025", "S2 2025", "2025". */
  readonly etiqueta: string;
  /** Primer día del período (ISO yyyy-MM-dd). */
  readonly fechaInicio: string;
  /** Último día del período (ISO yyyy-MM-dd). */
  readonly fechaFin: string;
  /** Identificador estable: "2025-Mensual-01". */
  readonly id: string;
}

function iso(anio: number, mes: number, dia: number): string {
  return `${anio.toString().padStart(4, '0')}-${mes.toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
}

function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export function crearPeriodo(
  anio: number,
  periodicidad: Periodicidad,
  numero: number,
  definicion?: DefinicionPeriodicidad
): Periodo {
  if (periodicidad === Periodicidad.Personalizada) {
    if (!definicion) {
      throw new Error('Se requiere la definición de periodicidad personalizada para generar el período.');
    }
    const corte = definicion.cortes.find((c) => c.numero === numero);
    if (!corte) {
      throw new RangeError(`La definición "${definicion.nombre}" no tiene un corte número ${numero}.`);
    }
    return {
      anio,
      periodicidad,
      numero,
      etiqueta: `${corte.etiqueta} ${anio}`,
      fechaInicio: iso(anio, corte.mesInicio, 1),
      fechaFin: iso(anio, corte.mesFin, ultimoDiaDelMes(anio, corte.mesFin)),
      id: `${anio}-${periodicidad}-${numero.toString().padStart(2, '0')}`
    };
  }

  const info = infoPeriodicidad(periodicidad);
  if (numero < 1 || numero > info.periodosPorAnio) {
    throw new RangeError(`Número de período ${numero} fuera de rango para ${periodicidad}.`);
  }
  const mesInicio = (numero - 1) * info.mesesPorPeriodo + 1;
  const mesFin = numero * info.mesesPorPeriodo;
  const etiqueta =
    periodicidad === Periodicidad.Mensual
      ? `${NOMBRES_MES[mesInicio - 1]} ${anio}`
      : periodicidad === Periodicidad.Anual
        ? `${anio}`
        : `${info.prefijo}${numero} ${anio}`;
  return {
    anio,
    periodicidad,
    numero,
    etiqueta,
    fechaInicio: iso(anio, mesInicio, 1),
    fechaFin: iso(anio, mesFin, ultimoDiaDelMes(anio, mesFin)),
    id: `${anio}-${periodicidad}-${numero.toString().padStart(2, '0')}`
  };
}
