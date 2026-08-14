import type { MapeoColumna } from '../entities/AutomatizacionIndicador';

/** Una desagregación del indicador junto con su referencia DAX `Tabla[Columna]` en este origen. */
export interface DesagregacionDax {
  listaId: string;
  /** Tal como quedó guardada en el "alias por origen" de la lista (con o sin comillas en la tabla). */
  referenciaDax: string;
}

export interface ParametrosGeneracionDax {
  desagregaciones: DesagregacionDax[];
  /** Tabla de fechas del modelo (una sola vez por origen, en su configuración). */
  tablaFecha: string;
  /** Columna de fecha dentro de `tablaFecha`. */
  columnaFecha: string;
  /** Rango del período a consultar, ISO `yyyy-MM-dd` (de `Periodo.fechaInicio`/`fechaFin`). */
  fechaInicio: string;
  fechaFin: string;
  /** Nombre de la medida DAX del indicador (con o sin corchetes). */
  medida: string;
}

export interface ConsultaDaxGenerada {
  script: string;
  columnaValor: string;
  mapeoColumnas: MapeoColumna[];
}

interface ReferenciaDaxNormalizada {
  tabla: string;
  columna: string;
  /** Forma segura para usar dentro del texto DAX: tabla siempre entre comillas simples. */
  calificada: string;
}

/**
 * Normaliza una referencia `Tabla[Columna]` (como la que el usuario guarda en
 * el alias por origen de una lista) a su forma DAX-segura: la tabla queda
 * SIEMPRE entre comillas simples en el texto generado (aunque el alias no las
 * traiga y aunque no sean estrictamente necesarias) para blindarse de
 * espacios/acentos en el nombre; acepta el alias con o sin comillas ya
 * puestas por quien lo escribió.
 */
export function normalizarReferenciaDax(referencia: string): ReferenciaDaxNormalizada {
  const limpio = referencia.trim();
  const coincidencia = /^'?([^'[\]]+?)'?\[([^[\]]+)\]$/.exec(limpio);
  if (!coincidencia) {
    throw new Error(`Referencia DAX inválida: "${referencia}". Se espera el formato Tabla[Columna].`);
  }
  const tabla = (coincidencia[1] ?? '').trim();
  const columna = (coincidencia[2] ?? '').trim();
  if (!tabla || !columna) {
    throw new Error(`Referencia DAX inválida: "${referencia}". Se espera el formato Tabla[Columna].`);
  }
  return { tabla, columna, calificada: `'${tabla}'[${columna}]` };
}

function fechaDax(fechaIso: string): string {
  const partes = fechaIso.split('-').map((n) => parseInt(n, 10));
  if (partes.length !== 3 || partes.some((n) => Number.isNaN(n))) {
    throw new Error(`Fecha inválida para DAX: "${fechaIso}".`);
  }
  const [anio, mes, dia] = partes as [number, number, number];
  return `DATE(${anio}, ${mes}, ${dia})`;
}

/**
 * Genera una consulta `EVALUATE SUMMARIZECOLUMNS(...)` de Power BI a partir
 * de la configuración ya mapeada del origen (una vez por origen: alias de
 * cada desagregación + tabla/columna de fecha) y del nombre de la medida del
 * indicador — sin que el usuario tenga que escribir DAX a mano. Las columnas
 * de agrupación se envuelven en `ROLLUPADDISSUBTOTAL` para obtener, en la
 * misma consulta, el cubo completo (General + subtotales + detalle) junto
 * con una columna booleana `EsSubtotalN` por desagregación — el mismo rol que
 * cumple el "segmentador de subtotal" del mapeo manual, aquí generado
 * automáticamente.
 */
export function generarConsultaDax(parametros: ParametrosGeneracionDax): ConsultaDaxGenerada {
  const { desagregaciones, tablaFecha, columnaFecha, fechaInicio, fechaFin, medida } = parametros;
  if (desagregaciones.length === 0) {
    throw new Error('Se requiere al menos una desagregación con alias DAX mapeado para generar la consulta.');
  }
  if (!tablaFecha.trim() || !columnaFecha.trim()) {
    throw new Error('Configure la tabla y la columna de fecha del origen antes de generar la consulta.');
  }
  if (!medida.trim()) {
    throw new Error('Ingrese el nombre de la medida DAX.');
  }

  const referencias = desagregaciones.map((d) => ({ listaId: d.listaId, ref: normalizarReferenciaDax(d.referenciaDax) }));
  const fechaRef = normalizarReferenciaDax(`${tablaFecha}[${columnaFecha}]`);
  const nombresSubtotal = referencias.map((_, i) => `EsSubtotal${i + 1}`);

  const argumentosRollup = referencias.map((r, i) => `${r.ref.calificada}, "${nombresSubtotal[i]}"`).join(', ');
  const medidaLimpia = medida.trim().replace(/^\[|\]$/g, '');
  const filtroFecha =
    `FILTER('${fechaRef.tabla}', ${fechaRef.calificada} >= ${fechaDax(fechaInicio)} && ${fechaRef.calificada} <= ${fechaDax(fechaFin)})`;

  const script = [
    'EVALUATE',
    'SUMMARIZECOLUMNS(',
    `  ROLLUPADDISSUBTOTAL(${argumentosRollup}),`,
    `  ${filtroFecha},`,
    `  "Total", [${medidaLimpia}]`,
    ')'
  ].join('\n');

  const mapeoColumnas: MapeoColumna[] = referencias.map((r, i) => ({
    columna: `${r.ref.tabla}[${r.ref.columna}]`,
    listaId: r.listaId,
    columnaSegmentadorSubtotal: `[${nombresSubtotal[i]}]`
  }));

  return { script, columnaValor: '[Total]', mapeoColumnas };
}
