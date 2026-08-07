/** Lista de selección administrable, base de desagregaciones y atributos de selección. */
export interface Lista {
  readonly id: string;
  nombre: string;
  descripcion: string;
  /** Raíz alfabética en mayúsculas (única entre listas) usada para generar el código de cada elemento nuevo. */
  prefijo: string;
  estado: 'Activa' | 'Inactiva';
  /** Se incrementa en cada modificación estructural (elementos añadidos/quitados). */
  version: number;
  orden: number;
  /** true cuando la lista es jerárquica (elementos con padre). */
  jerarquica: boolean;
  /** Marca de borrado lógico (bloqueado por estar en uso): distinta de `estado`, que el usuario alterna manualmente. */
  eliminado: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/** Elemento de una lista; `padreCodigo` habilita listas multinivel. */
export interface ElementoLista {
  readonly id: string;
  listaId: string;
  codigo: string;
  /** Nombre visible del elemento (obligatorio). */
  nombre: string;
  /** Descripción adicional opcional. */
  descripcion: string;
  orden: number;
  padreCodigo: string | null;
  activo: boolean;
}

/**
 * Código de un elemento nuevo a partir del prefijo de su lista y su orden
 * secuencial (p. ej. "SX-01" para el primer elemento de una lista con
 * prefijo "SX", o "E1" si la lista aún no tiene prefijo). Única fuente de
 * verdad para esta notación — la usa tanto la UI de Listas (alta manual,
 * pegado desde Excel) como la conciliación de orígenes automáticos (alta de
 * elementos que el origen trajo y la lista todavía no tenía), para que
 * ambos caminos generen códigos consistentes entre sí.
 */
export function generarCodigoElemento(prefijo: string, orden: number): string {
  return prefijo ? `${prefijo}-${String(orden).padStart(2, '0')}` : `E${orden}`;
}
