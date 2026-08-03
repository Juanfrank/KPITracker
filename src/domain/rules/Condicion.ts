/**
 * AST del motor declarativo de reglas. Las condiciones se serializan como
 * JSON y se evalúan contra un contexto de atributos; nunca hay lógica de
 * negocio codificada en los módulos.
 *
 * Ejemplos:
 *   Mostrar si Estado = Activo:
 *     { op: 'eq', args: [{ attr: 'Estado' }, { literal: 'Activo' }] }
 *   Obligatorio si Monto > 5000:
 *     { op: 'gt', args: [{ attr: 'Monto' }, { literal: 5000 }] }
 *   FechaFinal > FechaInicio:
 *     { op: 'gt', args: [{ attr: 'FechaFinal' }, { attr: 'FechaInicio' }] }
 */

export type Operando =
  | { attr: string }
  | { literal: string | number | boolean | null }
  | Condicion;

export interface Condicion {
  op: string;
  args: Operando[];
}

export function esCondicion(o: Operando): o is Condicion {
  return typeof o === 'object' && o !== null && 'op' in o;
}

/** Contexto de evaluación: resuelve valores de atributos por nombre. */
export interface ContextoEvaluacion {
  obtenerAtributo(nombre: string): string | number | boolean | null;
}
