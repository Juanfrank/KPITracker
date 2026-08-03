import { Periodicidad, infoPeriodicidad } from '../value-objects/Periodicidad';
import type { Periodo } from '../value-objects/Periodo';
import { crearPeriodo } from '../value-objects/Periodo';
import { NoImplementadoError } from '../errors/errores';

/**
 * Genera los períodos disponibles según la periodicidad configurada y el
 * año inicial global. Servicio puro de dominio.
 */
export class GeneradorPeriodos {
  /** Todos los períodos de un año para una periodicidad. */
  periodosDelAnio(anio: number, periodicidad: Periodicidad): Periodo[] {
    if (periodicidad === Periodicidad.Personalizada) {
      throw new NoImplementadoError('La periodicidad Personalizada aún no está implementada.');
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
  periodosDisponibles(anioInicial: number, periodicidad: Periodicidad, hoyIso: string): Periodo[] {
    const anioActual = Number(hoyIso.slice(0, 4));
    const periodos: Periodo[] = [];
    for (let anio = anioInicial; anio <= anioActual; anio++) {
      for (const p of this.periodosDelAnio(anio, periodicidad)) {
        if (p.fechaInicio <= hoyIso) periodos.push(p);
      }
    }
    return periodos;
  }

  /** Períodos ya cerrados (fecha fin anterior a hoy): los que deben levantarse. */
  periodosCerrados(anioInicial: number, periodicidad: Periodicidad, hoyIso: string): Periodo[] {
    return this.periodosDisponibles(anioInicial, periodicidad, hoyIso).filter((p) => p.fechaFin < hoyIso);
  }
}
