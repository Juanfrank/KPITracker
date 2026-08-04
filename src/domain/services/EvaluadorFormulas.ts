import { ValidacionError } from '../errors/errores';

/**
 * Evaluador de fórmulas de indicadores calculados. Sintaxis: expresión
 * aritmética estándar (+ - * / paréntesis, números decimales) donde las
 * referencias a otros indicadores se escriben entre corchetes con su
 * código, p. ej. "[IND-001] + [IND-002] * 0.5". Los corchetes evitan
 * ambigüedad entre el operador de resta y guiones dentro de un código.
 */

type Token =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'ref'; codigo: string }
  | { tipo: 'op'; valor: '+' | '-' | '*' | '/' }
  | { tipo: 'parentesis'; valor: '(' | ')' };

type Nodo =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'ref'; codigo: string }
  | { tipo: 'binaria'; op: '+' | '-' | '*' | '/'; izq: Nodo; der: Nodo }
  | { tipo: 'negacion'; nodo: Nodo };

function tokenizar(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const c: string = formula.charAt(i);
    if (/\s/.test(c)) {
      i++;
    } else if (c === '[') {
      const fin = formula.indexOf(']', i);
      if (fin === -1) throw new ValidacionError(`Fórmula inválida: falta "]" después de la posición ${i}.`);
      const codigo = formula.slice(i + 1, fin).trim();
      if (!codigo) throw new ValidacionError('Fórmula inválida: referencia vacía "[]".');
      tokens.push({ tipo: 'ref', codigo });
      i = fin + 1;
    } else if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < formula.length && /[0-9.]/.test(formula.charAt(j))) j++;
      const texto = formula.slice(i, j);
      const valor = Number(texto);
      if (Number.isNaN(valor)) throw new ValidacionError(`Fórmula inválida: número mal formado "${texto}".`);
      tokens.push({ tipo: 'numero', valor });
      i = j;
    } else if ('+-*/'.includes(c)) {
      tokens.push({ tipo: 'op', valor: c as '+' | '-' | '*' | '/' });
      i++;
    } else if (c === '(' || c === ')') {
      tokens.push({ tipo: 'parentesis', valor: c });
      i++;
    } else {
      throw new ValidacionError(`Fórmula inválida: carácter no soportado "${c}".`);
    }
  }
  return tokens;
}

/** Parser recursivo descendente con precedencia estándar (+ - menor que * /). */
class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private actual(): Token | undefined {
    return this.tokens[this.pos];
  }

  parse(): Nodo {
    const nodo = this.expresion();
    if (this.pos < this.tokens.length) {
      throw new ValidacionError('Fórmula inválida: contenido inesperado al final.');
    }
    return nodo;
  }

  private expresion(): Nodo {
    let izq = this.termino();
    while (this.actual()?.tipo === 'op' && (this.actual() as { valor: string }).valor in { '+': 1, '-': 1 }) {
      const op = (this.tokens[this.pos] as { tipo: 'op'; valor: '+' | '-' }).valor;
      this.pos++;
      const der = this.termino();
      izq = { tipo: 'binaria', op, izq, der };
    }
    return izq;
  }

  private termino(): Nodo {
    let izq = this.factor();
    while (this.actual()?.tipo === 'op' && (this.actual() as { valor: string }).valor in { '*': 1, '/': 1 }) {
      const op = (this.tokens[this.pos] as { tipo: 'op'; valor: '*' | '/' }).valor;
      this.pos++;
      const der = this.factor();
      izq = { tipo: 'binaria', op, izq, der };
    }
    return izq;
  }

  private factor(): Nodo {
    const t = this.actual();
    if (!t) throw new ValidacionError('Fórmula inválida: expresión incompleta.');
    if (t.tipo === 'op' && t.valor === '-') {
      this.pos++;
      return { tipo: 'negacion', nodo: this.factor() };
    }
    if (t.tipo === 'numero') {
      this.pos++;
      return { tipo: 'numero', valor: t.valor };
    }
    if (t.tipo === 'ref') {
      this.pos++;
      return { tipo: 'ref', codigo: t.codigo };
    }
    if (t.tipo === 'parentesis' && t.valor === '(') {
      this.pos++;
      const nodo = this.expresion();
      const cierre = this.actual();
      if (!cierre || cierre.tipo !== 'parentesis' || cierre.valor !== ')') {
        throw new ValidacionError('Fórmula inválida: falta ")".');
      }
      this.pos++;
      return nodo;
    }
    throw new ValidacionError('Fórmula inválida: token inesperado.');
  }
}

function evaluarNodo(nodo: Nodo, valores: Map<string, number | null>): number | null {
  switch (nodo.tipo) {
    case 'numero':
      return nodo.valor;
    case 'ref': {
      const v = valores.get(nodo.codigo);
      return v === undefined ? null : v;
    }
    case 'negacion': {
      const v = evaluarNodo(nodo.nodo, valores);
      return v === null ? null : -v;
    }
    case 'binaria': {
      const izq = evaluarNodo(nodo.izq, valores);
      const der = evaluarNodo(nodo.der, valores);
      if (izq === null || der === null) return null;
      switch (nodo.op) {
        case '+': return izq + der;
        case '-': return izq - der;
        case '*': return izq * der;
        case '/': return der === 0 ? null : izq / der;
      }
    }
  }
}

function recorrerRefs(nodo: Nodo, acc: Set<string>): void {
  if (nodo.tipo === 'ref') acc.add(nodo.codigo);
  else if (nodo.tipo === 'negacion') recorrerRefs(nodo.nodo, acc);
  else if (nodo.tipo === 'binaria') {
    recorrerRefs(nodo.izq, acc);
    recorrerRefs(nodo.der, acc);
  }
}

export class EvaluadorFormulas {
  /** Lanza ValidacionError si la sintaxis es inválida; en éxito, no hace nada. */
  validar(formula: string): void {
    if (!formula.trim()) throw new ValidacionError('La fórmula no puede estar vacía.');
    new Parser(tokenizar(formula)).parse();
  }

  /** Códigos de indicador referenciados por la fórmula (para resolver dependencias y detectar ciclos). */
  codigosReferenciados(formula: string): string[] {
    const nodo = new Parser(tokenizar(formula)).parse();
    const acc = new Set<string>();
    recorrerRefs(nodo, acc);
    return [...acc];
  }

  /**
   * Evalúa la fórmula sustituyendo cada referencia por su valor. Si alguna
   * referencia no tiene valor (null/ausente) o hay una división por cero,
   * el resultado es null (no calculable con los datos disponibles).
   */
  evaluar(formula: string, valores: Map<string, number | null>): number | null {
    const nodo = new Parser(tokenizar(formula)).parse();
    return evaluarNodo(nodo, valores);
  }

  /**
   * Detecta si agregar `formula` al indicador `codigo` crearía un ciclo de
   * dependencias, dado el mapa código -> fórmula del resto de indicadores
   * calculados. DFS sobre el grafo de dependencias.
   */
  formaCiclo(codigo: string, formula: string, formulasPorCodigo: Map<string, string>): boolean {
    const visitando = new Set<string>();

    const dfs = (actual: string, formulaActual: string): boolean => {
      if (visitando.has(actual)) return true;
      visitando.add(actual);
      let referencias: string[];
      try {
        referencias = this.codigosReferenciados(formulaActual);
      } catch {
        referencias = [];
      }
      for (const ref of referencias) {
        if (ref === codigo) return true;
        const formulaRef = formulasPorCodigo.get(ref);
        if (formulaRef && dfs(ref, formulaRef)) return true;
      }
      visitando.delete(actual);
      return false;
    };

    return dfs(codigo, formula);
  }
}
