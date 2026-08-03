import type { Condicion, Operando } from './Condicion';
import { esCondicion } from './Condicion';

/** Operadores que aceptan hijos anidados (agrupadores lógicos). */
export const OPERADORES_LOGICOS = ['and', 'or', 'not'] as const;
export type OperadorLogico = (typeof OPERADORES_LOGICOS)[number];

export function esOperadorLogico(op: string): op is OperadorLogico {
  return (OPERADORES_LOGICOS as readonly string[]).includes(op);
}

/** Condición de comparación por defecto, usada al crear una regla nueva o un hijo nuevo. */
export function condicionVacia(): Condicion {
  return { op: 'eq', args: [{ attr: '' }, { literal: '' }] };
}

/** Envuelve una condición existente en un nuevo grupo lógico (and/or) junto a una condición vacía. */
export function envolverEnGrupo(actual: Condicion, operadorGrupo: 'and' | 'or'): Condicion {
  return { op: operadorGrupo, args: [actual, condicionVacia()] };
}

/** Agrega una condición vacía como nuevo hijo de un grupo and/or existente. */
export function agregarHijo(grupo: Condicion): Condicion {
  return { ...grupo, args: [...grupo.args, condicionVacia()] };
}

/** Elimina el hijo en `indice` de un grupo and/or. */
export function quitarHijo(grupo: Condicion, indice: number): Condicion {
  return { ...grupo, args: grupo.args.filter((_, i) => i !== indice) };
}

/** Reemplaza el hijo en `indice` de un grupo and/or (o el único operando de `not`). */
export function reemplazarHijo(grupo: Condicion, indice: number, nuevo: Operando): Condicion {
  return { ...grupo, args: grupo.args.map((a, i) => (i === indice ? nuevo : a)) };
}

/** Extrae el conjunto de nombres de atributo referenciados por una condición (para validación/sugerencias). */
export function atributosReferenciados(condicion: Condicion): string[] {
  const nombres = new Set<string>();
  const recorrer = (o: Operando): void => {
    if (esCondicion(o)) {
      for (const arg of o.args) recorrer(arg);
    } else if ('attr' in o && o.attr) {
      nombres.add(o.attr);
    }
  };
  recorrer(condicion);
  return [...nombres];
}
