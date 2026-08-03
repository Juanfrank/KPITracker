/**
 * Validaciones declarativas de atributos. Cada atributo puede definir
 * múltiples validaciones; se evalúan con el ValidadorAtributos.
 * Discriminated union: agregar una validación nueva implica añadir un
 * miembro y su evaluador en el registro, sin tocar las existentes.
 */
export type ValidacionAtributo =
  | { tipo: 'Obligatorio' }
  | { tipo: 'LongitudMinima'; valor: number }
  | { tipo: 'LongitudMaxima'; valor: number }
  | { tipo: 'ValorMinimo'; valor: number }
  | { tipo: 'ValorMaximo'; valor: number }
  | { tipo: 'FechaMinima'; valor: string }
  | { tipo: 'FechaMaxima'; valor: string }
  | { tipo: 'ExpresionRegular'; patron: string; mensaje?: string }
  | { tipo: 'ValorUnico' };

export interface ErrorValidacion {
  validacion: ValidacionAtributo['tipo'];
  mensaje: string;
}
