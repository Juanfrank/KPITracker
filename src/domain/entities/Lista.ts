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
