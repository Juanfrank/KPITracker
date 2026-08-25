/**
 * Aplana un catálogo con `padreId` en orden jerárquico (DFS pre-order,
 * alfabético dentro de cada nivel) para mostrarlo indentado en una tabla o
 * un `<select>`. Un `padreId` que apunta a un id ausente de `items` (p. ej.
 * el padre está eliminado y oculto) se trata como raíz, para no perder la
 * fila de la lista.
 *
 * Extraído de `AdminPage.tsx` (Batch U, U4/U5a) a un util compartido en
 * Batch X (X12) para reutilizarlo también en `IndicadoresPage.tsx` (dropdown
 * de Categoría con jerarquía visual).
 */
export function ordenarJerarquia<T extends { id: string; padreId: string | null; nombre: string }>(
  items: readonly T[]
): Array<T & { nivel: number }> {
  const ids = new Set(items.map((i) => i.id));
  const porPadre = new Map<string | null, T[]>();
  for (const item of items) {
    const clave = item.padreId && ids.has(item.padreId) ? item.padreId : null;
    const lista = porPadre.get(clave) ?? [];
    lista.push(item);
    porPadre.set(clave, lista);
  }
  for (const lista of porPadre.values()) lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
  const resultado: Array<T & { nivel: number }> = [];
  const visitar = (padreId: string | null, nivel: number): void => {
    for (const item of porPadre.get(padreId) ?? []) {
      resultado.push({ ...item, nivel });
      visitar(item.id, nivel + 1);
    }
  };
  visitar(null, 0);
  return resultado;
}
