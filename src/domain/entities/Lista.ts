/** Lista de selección administrable, base de desagregaciones y atributos de selección. */
export interface Lista {
  readonly id: string;
  nombre: string;
  descripcion: string;
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
  descripcion: string;
  orden: number;
  padreCodigo: string | null;
  activo: boolean;
}
