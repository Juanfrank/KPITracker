import type { Condicion, Operando } from './Condicion';
import { esCondicion } from './Condicion';

/** Etiquetas legibles de los operadores base, usadas por el explicador y el constructor visual. */
export const ETIQUETAS_OPERADORES: Record<string, string> = {
  eq: 'es igual a',
  ne: 'es distinto de',
  gt: 'es mayor que',
  gte: 'es mayor o igual que',
  lt: 'es menor que',
  lte: 'es menor o igual que',
  between: 'está entre',
  isEmpty: 'está vacío',
  notEmpty: 'no está vacío',
  contains: 'contiene',
  matches: 'cumple la expresión regular',
  and: 'Y',
  or: 'O',
  not: 'NO'
};

function explicarOperando(operando: Operando): string {
  if (esCondicion(operando)) return `(${explicarCondicion(operando)})`;
  if ('attr' in operando) return operando.attr;
  if (operando.literal == null) return 'vacío';
  return typeof operando.literal === 'string' ? `"${operando.literal}"` : String(operando.literal);
}

/**
 * Traduce un AST de condición a una frase legible en español, para mostrar
 * en la tabla de reglas sin obligar al usuario a leer JSON.
 * Ejemplo: { op: 'gt', args: [{attr:'Monto'},{literal:5000}] } → "Monto es mayor que 5000"
 */
export function explicarCondicion(condicion: Condicion): string {
  const etiqueta = ETIQUETAS_OPERADORES[condicion.op] ?? condicion.op;

  if (condicion.op === 'and' || condicion.op === 'or') {
    const partes = condicion.args.map((a) => explicarOperando(a));
    return partes.join(` ${etiqueta} `);
  }
  if (condicion.op === 'not') {
    return `${etiqueta} (${explicarOperando(condicion.args[0]!)})`;
  }
  if (condicion.op === 'isEmpty' || condicion.op === 'notEmpty') {
    return `${explicarOperando(condicion.args[0]!)} ${etiqueta}`;
  }
  if (condicion.op === 'between') {
    return `${explicarOperando(condicion.args[0]!)} ${etiqueta} ${explicarOperando(condicion.args[1]!)} y ${explicarOperando(condicion.args[2]!)}`;
  }
  const [izq, der] = condicion.args;
  if (izq && der) return `${explicarOperando(izq)} ${etiqueta} ${explicarOperando(der)}`;
  return `${etiqueta}(${condicion.args.map(explicarOperando).join(', ')})`;
}
