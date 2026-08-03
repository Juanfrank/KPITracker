import type { Condicion, ContextoEvaluacion, Operando } from './Condicion';
import { esCondicion } from './Condicion';

type Escalar = string | number | boolean | null;

export type Operador = {
  readonly nombre: string;
  readonly etiqueta: string;
  /** Aridad esperada; null = variádica (and/or). */
  readonly aridad: number | null;
  evaluar(valores: Escalar[]): Escalar;
};

function comparar(a: Escalar, b: Escalar): number | null {
  if (a == null || b == null) return null;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function op(nombre: string, etiqueta: string, aridad: number | null, evaluar: (v: Escalar[]) => Escalar): Operador {
  return { nombre, etiqueta, aridad, evaluar };
}

const OPERADORES_BASE: Operador[] = [
  op('eq', 'Igual a', 2, (v) => v[0] === v[1] || (v[0] != null && v[1] != null && String(v[0]) === String(v[1]))),
  op('ne', 'Distinto de', 2, (v) => !(v[0] === v[1] || (v[0] != null && v[1] != null && String(v[0]) === String(v[1])))),
  op('gt', 'Mayor que', 2, (v) => { const c = comparar(v[0] ?? null, v[1] ?? null); return c != null && c > 0; }),
  op('gte', 'Mayor o igual que', 2, (v) => { const c = comparar(v[0] ?? null, v[1] ?? null); return c != null && c >= 0; }),
  op('lt', 'Menor que', 2, (v) => { const c = comparar(v[0] ?? null, v[1] ?? null); return c != null && c < 0; }),
  op('lte', 'Menor o igual que', 2, (v) => { const c = comparar(v[0] ?? null, v[1] ?? null); return c != null && c <= 0; }),
  op('between', 'Entre', 3, (v) => {
    const c1 = comparar(v[0] ?? null, v[1] ?? null);
    const c2 = comparar(v[0] ?? null, v[2] ?? null);
    return c1 != null && c2 != null && c1 >= 0 && c2 <= 0;
  }),
  op('isEmpty', 'Está vacío', 1, (v) => v[0] == null || String(v[0]).trim() === ''),
  op('notEmpty', 'No está vacío', 1, (v) => !(v[0] == null || String(v[0]).trim() === '')),
  op('contains', 'Contiene', 2, (v) => v[0] != null && v[1] != null && String(v[0]).toLowerCase().includes(String(v[1]).toLowerCase())),
  op('matches', 'Cumple expresión regular', 2, (v) => v[0] != null && v[1] != null && new RegExp(String(v[1])).test(String(v[0]))),
  op('and', 'Y', null, (v) => v.every(Boolean)),
  op('or', 'O', null, (v) => v.some(Boolean)),
  op('not', 'No', 1, (v) => !v[0])
];

/**
 * Motor de evaluación de condiciones declarativas. Los operadores viven en
 * un registro extensible: agregar un operador nuevo no toca el evaluador.
 */
export class EvaluadorReglas {
  private readonly operadores = new Map<string, Operador>();

  constructor(operadores: Operador[] = OPERADORES_BASE) {
    for (const o of operadores) this.operadores.set(o.nombre, o);
  }

  registrarOperador(operador: Operador): void {
    if (this.operadores.has(operador.nombre)) {
      throw new Error(`El operador "${operador.nombre}" ya está registrado.`);
    }
    this.operadores.set(operador.nombre, operador);
  }

  listarOperadores(): Operador[] {
    return [...this.operadores.values()];
  }

  /** Evalúa una condición contra el contexto; el resultado se coacciona a boolean. */
  evaluar(condicion: Condicion, contexto: ContextoEvaluacion): boolean {
    return Boolean(this.evaluarNodo(condicion, contexto));
  }

  private evaluarNodo(condicion: Condicion, contexto: ContextoEvaluacion): Escalar {
    const operador = this.operadores.get(condicion.op);
    if (!operador) throw new Error(`Operador no registrado: "${condicion.op}".`);
    if (operador.aridad != null && condicion.args.length !== operador.aridad) {
      throw new Error(`El operador "${condicion.op}" espera ${operador.aridad} argumento(s).`);
    }
    const valores = condicion.args.map((arg) => this.evaluarOperando(arg, contexto));
    return operador.evaluar(valores);
  }

  private evaluarOperando(operando: Operando, contexto: ContextoEvaluacion): Escalar {
    if (esCondicion(operando)) return this.evaluarNodo(operando, contexto);
    if ('attr' in operando) return contexto.obtenerAtributo(operando.attr);
    return operando.literal;
  }
}
