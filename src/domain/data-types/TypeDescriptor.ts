import type { ColumnaEav, TipoDato } from '../value-objects/TipoDato';
import type { ErrorValidacion, ValidacionAtributo } from '../rules/Validaciones';

/** Valor tipado en tránsito dentro del dominio. */
export type ValorAtributo = string | number | boolean | string[] | null;

export interface ResultadoParse {
  ok: boolean;
  valor: ValorAtributo;
  error?: string;
}

/**
 * Descriptor de comportamiento de un tipo de dato. Todo el conocimiento
 * específico del tipo (parseo, formato, validación, editor sugerido y
 * columna física EAV) vive aquí. Agregar un tipo nuevo = registrar un
 * descriptor en el TypeRegistry; el núcleo no cambia (OCP).
 */
export interface TypeDescriptor {
  readonly tipo: TipoDato | string;
  /** Etiqueta legible para la UI. */
  readonly etiqueta: string;
  /** Columna física del modelo EAV donde se persiste. */
  readonly columnaEav: ColumnaEav;
  /** Editor sugerido para la UI ('text' | 'number' | 'checkbox' | 'date' | 'select'...). */
  readonly editorHint: string;
  /** Convierte texto crudo (celda, import) a valor tipado. */
  parse(crudo: string): ResultadoParse;
  /** Convierte valor tipado a texto para presentación. */
  format(valor: ValorAtributo): string;
  /** Validaciones específicas del tipo aplicables además de las genéricas. */
  validar(valor: ValorAtributo, validaciones: ValidacionAtributo[]): ErrorValidacion[];
}
