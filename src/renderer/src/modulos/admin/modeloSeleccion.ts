import type { CategoriaRespaldo, CategoriaResumen, ResumenRespaldo, SeleccionRespaldo } from '@infrastructure/perfiles/esquemaRespaldo';

/**
 * Modelo de selección puro (sin DOM) del selector de importación granular
 * (Batch N): checkboxes de categoría con estado tri-estado (todos/parcial/
 * ninguno) y checkboxes de ítem dentro de cada categoría. Toda la lógica
 * vive aquí, testeable con unit tests puros — `SelectorImportacion.tsx`
 * (Batch P; movido a `modulos/admin/` en la Fase 4 junto con `TarjetaRespaldo.tsx`,
 * ver plan §9.4/§9.5) solo renderiza este estado.
 *
 * Representación interna: cada categoría vale `'todos'` (todo seleccionado,
 * incluye ítems que se agreguen después) o un `Set<string>` de ids
 * puntuales (posiblemente vacío = nada seleccionado). `aSeleccionIpc`
 * normaliza esto al contrato `SeleccionRespaldo` que espera el backend
 * (ausencia de la clave = no importar esa categoría).
 */

export type EstadoCategoria = 'todos' | 'parcial' | 'ninguno';
export type EstadoSeleccion = Record<CategoriaRespaldo, 'todos' | Set<string>>;

function idsDe(categoria: CategoriaResumen): string[] {
  return categoria.items.map((i) => i.id);
}

/** Estado inicial: todas las categorías en `'todos'` (importar todo por defecto). */
export function seleccionInicial(resumen: ResumenRespaldo): EstadoSeleccion {
  const estado = {} as EstadoSeleccion;
  for (const categoria of resumen.categorias) estado[categoria.categoria] = 'todos';
  return estado;
}

export function estadoDeCategoria(estado: EstadoSeleccion, categoria: CategoriaResumen): EstadoCategoria {
  const valor = estado[categoria.categoria];
  if (valor === 'todos') return 'todos';
  if (valor.size === 0) return 'ninguno';
  if (valor.size >= categoria.total) return 'todos';
  return 'parcial';
}

/** Marca/desmarca la categoría completa (checkbox de cabecera). */
export function alternarCategoria(estado: EstadoSeleccion, categoria: CategoriaRespaldo, marcado: boolean): EstadoSeleccion {
  return { ...estado, [categoria]: marcado ? 'todos' : new Set<string>() };
}

/** Alias semántico de `alternarCategoria`: "Seleccionar todo/Deseleccionar todo" dentro del panel expandido de ítems. */
export function seleccionarTodosItems(estado: EstadoSeleccion, categoria: CategoriaResumen, marcado: boolean): EstadoSeleccion {
  return alternarCategoria(estado, categoria.categoria, marcado);
}

/** Marca/desmarca un ítem puntual dentro de una categoría. */
export function alternarItem(estado: EstadoSeleccion, categoria: CategoriaResumen, id: string, marcado: boolean): EstadoSeleccion {
  const valorActual = estado[categoria.categoria];
  const base = valorActual === 'todos' ? new Set(idsDe(categoria)) : new Set(valorActual);
  if (marcado) base.add(id);
  else base.delete(id);
  const normalizado: 'todos' | Set<string> = base.size >= categoria.total && categoria.total > 0 ? 'todos' : base;
  return { ...estado, [categoria.categoria]: normalizado };
}

export function contarSeleccionados(estado: EstadoSeleccion, categoria: CategoriaResumen): number {
  const valor = estado[categoria.categoria];
  return valor === 'todos' ? categoria.total : valor.size;
}

/** Normaliza al contrato del backend: categorías sin nada seleccionado se omiten (fail-closed). */
export function aSeleccionIpc(estado: EstadoSeleccion): SeleccionRespaldo {
  const seleccion: SeleccionRespaldo = {};
  for (const categoria of Object.keys(estado) as CategoriaRespaldo[]) {
    const valor = estado[categoria];
    if (valor === 'todos') {
      seleccion[categoria] = 'todos';
    } else if (valor.size > 0) {
      seleccion[categoria] = [...valor];
    }
  }
  return seleccion;
}
