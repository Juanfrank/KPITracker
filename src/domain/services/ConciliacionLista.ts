import type { ElementoLista } from '../entities/Lista';

export interface ReporteConciliacion {
  /** Valores únicos del resultado que coinciden con un elemento existente de la lista. */
  coincidentes: string[];
  /** Valores únicos del resultado que NO existen como elemento de la lista (candidatos a agregar o descartar). */
  noEncontrados: string[];
  /** Elementos activos de la lista que no aparecieron en el resultado (informativo). */
  sinDatoEnResultado: string[];
}

/**
 * Compara los valores únicos de una columna del resultado tabular de un
 * origen contra los elementos oficiales de una lista de selección, para que
 * el usuario decida si agrega los faltantes o descarta las filas que no
 * coinciden con ningún elemento conocido.
 *
 * Se compara contra el NOMBRE del elemento, no su código: un origen externo
 * (SQL, API, Power BI, XMLA) devuelve valores legibles como "Masculino" o
 * "Distrito Nacional", nunca los códigos internos de la lista (que además
 * pueden ser autogenerados sin relación alguna con el dato de origen, p.
 * ej. "SX-01" desde el prefijo de la lista) — comparar contra el código
 * garantizaba casi siempre cero coincidencias.
 */
export function conciliarConLista(valoresUnicos: string[], elementos: ElementoLista[]): ReporteConciliacion {
  const nombres = new Set(elementos.map((e) => e.nombre));
  const vistos = new Set(valoresUnicos);
  return {
    coincidentes: valoresUnicos.filter((v) => nombres.has(v)),
    noEncontrados: valoresUnicos.filter((v) => !nombres.has(v)),
    sinDatoEnResultado: elementos.filter((e) => e.activo && !vistos.has(e.nombre)).map((e) => e.nombre)
  };
}
