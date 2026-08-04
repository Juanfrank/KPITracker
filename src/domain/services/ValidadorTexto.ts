/**
 * Verifica que los signos de agrupación ( ), [ ], { } de un texto abran y
 * cierren correctamente (balanceados y bien anidados). Se usa para validar
 * campos de texto libre que pueden opcionalmente incluir notación
 * matemática (p. ej. "Forma de cálculo" de un indicador) sin exigir que el
 * texto sea una expresión evaluable — solo que, si hay signos de
 * agrupación, estén correctamente cerrados.
 */
export function signosAgrupacionBalanceados(texto: string): boolean {
  const cierres: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const pila: string[] = [];
  for (const caracter of texto) {
    if (caracter === '(' || caracter === '[' || caracter === '{') {
      pila.push(caracter);
    } else if (caracter === ')' || caracter === ']' || caracter === '}') {
      if (pila.pop() !== cierres[caracter]) return false;
    }
  }
  return pila.length === 0;
}
