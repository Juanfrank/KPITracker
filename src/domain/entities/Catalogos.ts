/** Catálogo simple de responsables asignables a un indicador. */
export interface Responsable {
  readonly id: string;
  nombre: string;
  correo: string | null;
  activo: boolean;
  /** Marca de borrado lógico (bloqueado por estar en uso): distinta de `activo`, que el usuario alterna manualmente. */
  eliminado: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/** Catálogo simple de categorías asignables a un indicador. */
export interface Categoria {
  readonly id: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  /** Marca de borrado lógico (bloqueado por estar en uso): distinta de `activo`, que el usuario alterna manualmente. */
  eliminado: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}
