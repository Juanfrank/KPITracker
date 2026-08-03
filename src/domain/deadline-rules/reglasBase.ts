import type { DeadlineRule } from './DeadlineRule';
import type { Periodo } from '../value-objects/Periodo';
import { DeadlineRuleRegistry } from './DeadlineRuleRegistry';
import {
  parseYmd, formatYmd, diasEnMes, mesSiguiente, sumarDias,
  nEsimoDiaSemanaDelMes, ultimoDiaSemanaDelMes, primerDiaHabilDelMes, ultimoDiaHabilDelMes
} from './fechas';

/** Mes de llenado: el mes siguiente al cierre del período. */
function mesDeLlenado(periodo: Periodo): { anio: number; mes: number } {
  const fin = parseYmd(periodo.fechaFin);
  return mesSiguiente(fin.anio, fin.mes);
}

function num(parametros: Record<string, unknown>, nombre: string, porDefecto?: number): number {
  const v = parametros[nombre];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (porDefecto !== undefined) return porDefecto;
  throw new Error(`Parámetro requerido "${nombre}" ausente o inválido en regla de fecha límite.`);
}

const PARAM_DIA_SEMANA = { nombre: 'diaSemana', etiqueta: 'Día de la semana', tipo: 'weekday' as const, min: 0, max: 6 };

export const reglaDiaFijoDelMes: DeadlineRule = {
  tipo: 'DiaFijoDelMes',
  etiqueta: 'Día fijo del mes siguiente al cierre',
  parametros: [{ nombre: 'dia', etiqueta: 'Día del mes (1-31)', tipo: 'number', min: 1, max: 31 }],
  calcular(periodo, parametros) {
    const { anio, mes } = mesDeLlenado(periodo);
    const dia = Math.min(num(parametros, 'dia'), diasEnMes(anio, mes));
    return formatYmd({ anio, mes, dia });
  }
};

export const reglaNEsimoDiaSemana: DeadlineRule = {
  tipo: 'NEsimoDiaSemana',
  etiqueta: 'N-ésimo día de semana del mes siguiente (1er lunes, 2do martes...)',
  parametros: [
    { nombre: 'n', etiqueta: 'Ocurrencia (1-4)', tipo: 'number', min: 1, max: 4 },
    PARAM_DIA_SEMANA
  ],
  calcular(periodo, parametros) {
    const { anio, mes } = mesDeLlenado(periodo);
    const f = nEsimoDiaSemanaDelMes(anio, mes, num(parametros, 'diaSemana'), num(parametros, 'n'));
    if (!f) throw new Error('La ocurrencia solicitada no existe en el mes.');
    return formatYmd(f);
  }
};

export const reglaUltimoDiaSemana: DeadlineRule = {
  tipo: 'UltimoDiaSemana',
  etiqueta: 'Último día de semana del mes siguiente (último viernes...)',
  parametros: [PARAM_DIA_SEMANA],
  calcular(periodo, parametros) {
    const { anio, mes } = mesDeLlenado(periodo);
    return formatYmd(ultimoDiaSemanaDelMes(anio, mes, num(parametros, 'diaSemana')));
  }
};

export const reglaPrimerDiaHabil: DeadlineRule = {
  tipo: 'PrimerDiaHabil',
  etiqueta: 'Primer día hábil del mes siguiente al cierre',
  parametros: [],
  calcular(periodo) {
    const { anio, mes } = mesDeLlenado(periodo);
    return formatYmd(primerDiaHabilDelMes(anio, mes));
  }
};

export const reglaUltimoDiaHabil: DeadlineRule = {
  tipo: 'UltimoDiaHabil',
  etiqueta: 'Último día hábil del mes siguiente al cierre',
  parametros: [],
  calcular(periodo) {
    const { anio, mes } = mesDeLlenado(periodo);
    return formatYmd(ultimoDiaHabilDelMes(anio, mes));
  }
};

export const reglaNDiasAntesCierre: DeadlineRule = {
  tipo: 'NDiasAntesCierre',
  etiqueta: 'N días antes del cierre del período',
  parametros: [{ nombre: 'dias', etiqueta: 'Días antes del cierre', tipo: 'number', min: 0, max: 90 }],
  calcular(periodo, parametros) {
    return formatYmd(sumarDias(parseYmd(periodo.fechaFin), -num(parametros, 'dias')));
  }
};

export function crearRegistroReglasFechaLimite(): DeadlineRuleRegistry {
  const registro = new DeadlineRuleRegistry();
  registro.registrar(reglaDiaFijoDelMes);
  registro.registrar(reglaNEsimoDiaSemana);
  registro.registrar(reglaUltimoDiaSemana);
  registro.registrar(reglaPrimerDiaHabil);
  registro.registrar(reglaUltimoDiaHabil);
  registro.registrar(reglaNDiasAntesCierre);
  return registro;
}
