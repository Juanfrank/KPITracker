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
 */
export function conciliarConLista(valoresUnicos: string[], elementos: ElementoLista[]): ReporteConciliacion {
  const codigos = new Set(elementos.map((e) => e.codigo));
  const vistos = new Set(valoresUnicos);
  return {
    coincidentes: valoresUnicos.filter((v) => codigos.has(v)),
    noEncontrados: valoresUnicos.filter((v) => !codigos.has(v)),
    sinDatoEnResultado: elementos.filter((e) => e.activo && !vistos.has(e.codigo)).map((e) => e.codigo)
  };
}
