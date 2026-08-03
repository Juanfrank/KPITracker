import { Periodicidad, infoPeriodicidad } from '../value-objects/Periodicidad';
import type { Periodo } from '../value-objects/Periodo';
import { crearPeriodo } from '../value-objects/Periodo';
import type { DefinicionPeriodicidad } from '../entities/DefinicionPeriodicidad';

/**
 * Genera los períodos disponibles según la periodicidad configurada y el
 * año inicial global. Servicio puro de dominio. Cuando la periodicidad es
 * `Personalizada`, se requiere la `DefinicionPeriodicidad` correspondiente
 * (sus cortes determinan cantidad, etiquetas y meses de cada período).
 */
export class GeneradorPeriodos {
  /** Todos los períodos de un año para una periodicidad. */
  periodosDelAnio(anio: number, periodicidad: Periodicidad, definicion?: DefinicionPeriodicidad): Periodo[] {
    if (periodicidad === Periodicidad.Personalizada) {
      if (!definicion) throw new Error('Se requiere la definición de periodicidad personalizada.');
      return definicion.cortes
        .slice()
        .sort((a, b) => a.numero - b.numero)
        .map((corte) => crearPeriodo(anio, periodicidad, corte.numero, definicion));
    }
    const info = infoPeriodicidad(periodicidad);
    const periodos: Periodo[] = [];
    for (let n = 1; n <= info.periodosPorAnio; n++) {
      periodos.push(crearPeriodo(anio, periodicidad, n));
    }
    return periodos;
  }

  /**
   * Períodos desde el año inicial hasta la fecha de referencia inclusive
   * (solo períodos cuyo inicio ya ocurrió).
   */
  periodosDisponibles(
    anioInicial: number,
    periodicidad: Periodicidad,
    hoyIso: string,
    definicion?: DefinicionPeriodicidad
  ): Periodo[] {
    const anioActual = Number(hoyIso.slice(0, 4));
    const periodos: Periodo[] = [];
    for (let anio = anioInicial; anio <= anioActual; anio++) {
      for (const p of this.periodosDelAnio(anio, periodicidad, definicion)) {
        if (p.fechaInicio <= hoyIso) periodos.push(p);
      }
    }
    return periodos;
  }

  /** Períodos ya cerrados (fecha fin anterior a hoy): los que deben levantarse. */
  periodosCerrados(
    anioInicial: number,
    periodicidad: Periodicidad,
    hoyIso: string,
    definicion?: DefinicionPeriodicidad
  ): Periodo[] {
    return this.periodosDisponibles(anioInicial, periodicidad, hoyIso, definicion).filter((p) => p.fechaFin < hoyIso);
  }
}
