import { NOMBRES_MES } from '../value-objects/Periodicidad';
import type { Periodo } from '../value-objects/Periodo';
import type { FuenteParametroGeneral, ParametroGeneral } from '../entities/OrigenAutomatico';

/** Meses (1..12) cubiertos por el rango [fechaInicio, fechaFin] de un período, en orden. */
function mesesDelPeriodo(periodo: Periodo): number[] {
  const [anioIni, mesIni] = periodo.fechaInicio.split('-').map(Number);
  const [anioFin, mesFin] = periodo.fechaFin.split('-').map(Number);
  const meses: number[] = [];
  let anio = anioIni as number;
  let mes = mesIni as number;
  while (anio < (anioFin as number) || (anio === anioFin && mes <= (mesFin as number))) {
    meses.push(mes);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      anio += 1;
    }
  }
  return meses;
}

function valorFuente(fuente: FuenteParametroGeneral, periodo: Periodo): string {
  switch (fuente) {
    case 'PeriodoId':
      return periodo.id;
    case 'PeriodoEtiqueta':
      return periodo.etiqueta;
    case 'FechaInicio':
      return periodo.fechaInicio;
    case 'FechaFin':
      return periodo.fechaFin;
    case 'Anio':
      return String(periodo.anio);
    case 'MesNumero':
      return String(Number(periodo.fechaInicio.slice(5, 7)));
    case 'MesNombre':
      return NOMBRES_MES[Number(periodo.fechaInicio.slice(5, 7)) - 1] ?? '';
    case 'MesesNumeroLista':
      return mesesDelPeriodo(periodo).join(',');
    case 'MesesNombreLista':
      return mesesDelPeriodo(periodo).map((m) => NOMBRES_MES[m - 1] ?? '').join(',');
    case 'Numero':
      return String(periodo.numero);
    case 'Periodicidad':
      return periodo.periodicidad;
    default:
      return '';
  }
}

/** Resuelve los parámetros generales configurados de un origen a sus valores concretos para un período dado. */
export function resolverParametrosGenerales(parametros: ParametroGeneral[], periodo: Periodo): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const p of parametros) mapa.set(p.nombre, valorFuente(p.fuente, periodo));
  return mapa;
}
