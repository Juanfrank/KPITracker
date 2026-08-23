/**
 * Catálogo simple de responsables asignables a un indicador. Desde Batch T,
 * `equipoId` es obligatorio en la práctica (`ServicioResponsables.guardar`
 * lo exige, por defecto el equipo "General" — ver `asegurarEquipoGeneral`);
 * sigue tipado `string | null` porque el esquema no fuerza NOT NULL (la
 * integridad referencial de este catálogo vive, como el resto, en la capa
 * de aplicación) y para no romper la deserialización de filas antiguas.
 */
export interface Responsable {
  readonly id: string;
  nombre: string;
  correo: string | null;
  activo: boolean;
  /** Marca de borrado lógico (bloqueado por estar en uso): distinta de `activo`, que el usuario alterna manualmente. */
  eliminado: boolean;
  /** Equipo al que pertenece — determina el vínculo INDIRECTO equipo↔indicador (vía este responsable). Obligatorio, ver docstring. */
  equipoId: string | null;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/**
 * Catálogo de categorías asignables a un indicador — jerárquico (categoría →
 * subcategoría, cualquier profundidad) vía `padreId`. `prefijo` es
 * puramente visual: se compone en vivo con `Indicador.codigo` para
 * MOSTRARLO (ver `etiquetaConPrefijo`), nunca se persiste como parte del
 * código ni se usa en unicidad o referencias de fórmulas — decisión
 * explícita del usuario.
 */
export interface Categoria {
  readonly id: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  /** Marca de borrado lógico (bloqueado por estar en uso): distinta de `activo`, que el usuario alterna manualmente. */
  eliminado: boolean;
  /** Categoría padre (subcategoría de), o `null` = categoría raíz. */
  padreId: string | null;
  /** Prefijo visual opcional (mayúsculas alfabéticas, único entre categorías) — ver `etiquetaConPrefijo`. */
  prefijo: string | null;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/**
 * Ids fijos (no generados) de la categoría/equipo "General" — el respaldo al
 * que Batch T recurre cuando un indicador se guarda sin clasificar (ver
 * `ServicioIndicadores.guardar`). Sembrados con este mismo id literal por la
 * migración `20260901000000_roles_permisos.ts`, para que el código de
 * aplicación pueda referenciarlos sin tener que buscarlos por nombre (frágil
 * ante un renombrado) ni pasarlos como configuración.
 */
export const ID_CATEGORIA_GENERAL = 'categoria-general';
export const ID_EQUIPO_GENERAL = 'equipo-general';

/** Equipo organizacional — jerárquico (equipo → sub-equipo, cualquier profundidad) vía `padreId`. */
export interface Equipo {
  readonly id: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  /** Marca de borrado lógico (bloqueado por estar en uso): distinta de `activo`, que el usuario alterna manualmente. */
  eliminado: boolean;
  /** Equipo padre (sub-equipo de), o `null` = equipo raíz. */
  padreId: string | null;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/**
 * Compone el código visible de un indicador con el prefijo de su categoría,
 * SOLO para mostrar (ver el docstring de `Categoria.prefijo`) — nunca se
 * persiste. Se recalcula en cada lectura, así que editar el prefijo de la
 * categoría actualiza al instante lo que se muestra en toda la app.
 */
export function etiquetaConPrefijo(prefijoCategoria: string | null | undefined, codigo: string): string {
  return prefijoCategoria && codigo ? `${prefijoCategoria}-${codigo}` : codigo;
}

/**
 * Verifica que asignar `padreId` como padre de `id` no cree un ciclo (ni
 * auto-referencia). Recorre la cadena de ancestros del padre propuesto
 * (con un tope defensivo por si ya hubiera un ciclo previo en los datos) y
 * rechaza si en algún punto se vuelve a encontrar `id`. Compartida entre
 * `Categoria` y `Equipo` — ambas son la misma forma de árbol simple
 * (id + padreId), solo cambia de qué catálogo viene la lista.
 */
export function sinCiclo(id: string, padreId: string | null, todos: ReadonlyArray<{ readonly id: string; padreId: string | null }>): boolean {
  if (padreId === null) return true;
  if (padreId === id) return false;
  const porId = new Map(todos.map((t) => [t.id, t] as const));
  let actual: string | null = padreId;
  let pasos = 0;
  while (actual !== null) {
    if (actual === id) return false;
    if (++pasos > todos.length + 1) return false; // ciclo preexistente en los datos: no agravar
    actual = porId.get(actual)?.padreId ?? null;
  }
  return true;
}
