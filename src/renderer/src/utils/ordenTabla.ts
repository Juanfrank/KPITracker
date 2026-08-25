/**
 * Orden por encabezado de columna (Batch X, X4): mayor→menor, menor→mayor,
 * o el orden por defecto — un ciclo de 3 estados por clic, igual patrón que
 * cualquier grilla estándar (Excel, la mayoría de tablas de admin). Puro:
 * sin dependencia de React, así que se prueba con datos de ejemplo sin
 * montar ningún componente.
 */
export type Direccion = 'asc' | 'desc' | null;

export interface OrdenColumna {
  columna: string | null;
  direccion: Direccion;
}

export const ORDEN_POR_DEFECTO: OrdenColumna = { columna: null, direccion: null };

/** Un clic en `columna`: primera vez → asc; de nuevo → desc; una tercera → vuelve al orden por defecto (sin importar qué columna se clickeó antes). */
export function alternarOrden(actual: OrdenColumna, columna: string): OrdenColumna {
  if (actual.columna !== columna) return { columna, direccion: 'asc' };
  if (actual.direccion === 'asc') return { columna, direccion: 'desc' };
  return ORDEN_POR_DEFECTO;
}

/**
 * Ordena `filas` según `orden`, usando el extractor de `valorDe[orden.columna]`
 * — sin extractor registrado para esa columna, o sin columna elegida (orden
 * por defecto), devuelve `filas` tal cual (mismo orden que ya traía). Un
 * valor `null`/`undefined` siempre queda al final, sin importar la
 * dirección — evita que "sin dato" parezca el mínimo o el máximo real.
 */
export function ordenarFilas<F>(
  filas: readonly F[],
  orden: OrdenColumna,
  valorDe: Record<string, (fila: F) => string | number | null | undefined>
): F[] {
  if (!orden.columna || !orden.direccion) return [...filas];
  const obtener = valorDe[orden.columna];
  if (!obtener) return [...filas];
  const signo = orden.direccion === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    const va = obtener(a);
    const vb = obtener(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * signo;
    return String(va).localeCompare(String(vb), 'es') * signo;
  });
}
