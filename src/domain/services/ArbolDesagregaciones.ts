import type { CombinacionDesagregacion } from './ProductoCartesiano';
import { claveATexto, crearClave } from '../value-objects/ClaveDesagregacion';

/**
 * De un conjunto de etiquetas presentes en una combinación, la "más
 * reciente": la de mayor índice en `ordenDesagregaciones` (el orden de
 * configuración del indicador). Es la desagregación que, agregada a la
 * combinación padre (esa misma combinación sin esta etiqueta), produce
 * exactamente esta combinación — ver `ordenarComoArbol`. `null` si
 * `etiquetas` está vacío (la fila General no tiene "más reciente").
 */
export function etiquetaMasReciente<T extends { listaId: string }>(
  etiquetas: readonly T[],
  ordenDesagregaciones: readonly string[]
): T | null {
  if (etiquetas.length === 0) return null;
  const indiceDe = (listaId: string): number => {
    const i = ordenDesagregaciones.indexOf(listaId);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...etiquetas].sort((a, b) => indiceDe(b.listaId) - indiceDe(a.listaId))[0]!;
}

/**
 * Reordena el cubo completo que produce `ProductoCartesiano.generar()` (hoy
 * agrupado solo por `nivel`, con orden interno de producto cartesiano —
 * mezcla los subtotales de distintas desagregaciones sin ningún criterio
 * legible) en un recorrido en profundidad (DFS pre-order) de un árbol de
 * exploración: "drill-down" en el orden en que las desagregaciones fueron
 * configuradas en el indicador.
 *
 * Regla de padre/hijo: el padre de una combinación es la misma combinación
 * sin su desagregación de índice de configuración MÁS ALTO. Consecuencia:
 * - Todas las combinaciones de una sola desagregación (subtotal "puro") son
 *   hijas directas de General, en el orden de configuración de sus
 *   desagregaciones (primero todos los subtotales de la 1a desagregación
 *   configurada, luego los de la 2a, ...).
 * - Una combinación de detalle más fino (con más de una desagregación
 *   presente) cuelga siempre del subtotal de su desagregación PREVIA en el
 *   orden de configuración — nunca de la última agregada — así que
 *   "drillear" desde un subtotal de la 1a desagregación lleva a combinarla
 *   con la 2a, luego la 3a, etc., como una jerarquía real.
 * No se pierde ninguna combinación del cubo original (mismo conjunto,
 * mismo `nivel` — que además coincide exactamente con la profundidad en
 * este árbol): solo cambia el ORDEN en que se listan, para que el
 * resultado sea "aplanable" en una tabla con expansión/colapso por
 * profundidad (`nivel`), sin necesitar más metadatos que ese campo.
 */
export function ordenarComoArbol(
  combinaciones: readonly CombinacionDesagregacion[],
  ordenDesagregaciones: readonly string[]
): CombinacionDesagregacion[] {
  const indiceDe = (listaId: string): number => {
    const i = ordenDesagregaciones.indexOf(listaId);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };

  const porClaveTexto = new Map(combinaciones.map((c) => [claveATexto(c.clave), c] as const));
  const hijosDePadre = new Map<string, CombinacionDesagregacion[]>();

  for (const c of combinaciones) {
    if (c.nivel === 0) continue; // General no tiene padre.
    const reciente = etiquetaMasReciente(c.etiquetas, ordenDesagregaciones)!;
    const etiquetasPadre = c.etiquetas.filter((e) => e !== reciente);
    const claveTextoPadre = etiquetasPadre.length === 0
      ? 'GENERAL'
      : claveATexto(crearClave(etiquetasPadre.map((e) => [e.listaId, e.codigo] as const)));
    const hijos = hijosDePadre.get(claveTextoPadre) ?? [];
    hijos.push(c);
    hijosDePadre.set(claveTextoPadre, hijos);
  }

  // Hermanos: primero por orden de configuración de la desagregación recién
  // agregada, luego por el `orden` del elemento dentro de esa lista.
  for (const hijos of hijosDePadre.values()) {
    hijos.sort((a, b) => {
      const ea = etiquetaMasReciente(a.etiquetas, ordenDesagregaciones)!;
      const eb = etiquetaMasReciente(b.etiquetas, ordenDesagregaciones)!;
      return indiceDe(ea.listaId) - indiceDe(eb.listaId) || ea.orden - eb.orden;
    });
  }

  const resultado: CombinacionDesagregacion[] = [];
  const visitar = (claveTexto: string): void => {
    const nodo = porClaveTexto.get(claveTexto);
    if (!nodo) return;
    resultado.push(nodo);
    for (const hijo of hijosDePadre.get(claveTexto) ?? []) visitar(claveATexto(hijo.clave));
  };
  visitar('GENERAL');
  return resultado;
}
