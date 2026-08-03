/** Catálogo simple de responsables asignables a un indicador. */
export interface Responsable {
  readonly id: string;
  nombre: string;
  correo: string | null;
  activo: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/** Catálogo simple de categorías asignables a un indicador. */
export interface Categoria {
  readonly id: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}
