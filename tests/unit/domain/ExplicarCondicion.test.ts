import { describe, expect, it } from 'vitest';
import { explicarCondicion } from '@domain/rules/explicarCondicion';
import type { Condicion } from '@domain/rules/Condicion';

describe('explicarCondicion', () => {
  it('traduce una comparación simple con literal', () => {
    const c: Condicion = { op: 'gt', args: [{ attr: 'Monto' }, { literal: 5000 }] };
    expect(explicarCondicion(c)).toBe('Monto es mayor que 5000');
  });

  it('traduce una comparación entre dos atributos', () => {
    const c: Condicion = { op: 'gt', args: [{ attr: 'FechaFinal' }, { attr: 'FechaInicio' }] };
    expect(explicarCondicion(c)).toBe('FechaFinal es mayor que FechaInicio');
  });

  it('traduce igualdad con literal de texto entre comillas', () => {
    const c: Condicion = { op: 'eq', args: [{ attr: 'Estado' }, { literal: 'Activo' }] };
    expect(explicarCondicion(c)).toBe('Estado es igual a "Activo"');
  });

  it('traduce isEmpty/notEmpty en formato postfijo', () => {
    expect(explicarCondicion({ op: 'notEmpty', args: [{ attr: 'Justificacion' }] })).toBe('Justificacion no está vacío');
    expect(explicarCondicion({ op: 'isEmpty', args: [{ attr: 'Comentario' }] })).toBe('Comentario está vacío');
  });

  it('traduce between con los tres operandos', () => {
    const c: Condicion = { op: 'between', args: [{ attr: 'Monto' }, { literal: 100 }, { literal: 500 }] };
    expect(explicarCondicion(c)).toBe('Monto está entre 100 y 500');
  });

  it('traduce and/or uniendo las partes con el conector', () => {
    const c: Condicion = {
      op: 'and',
      args: [
        { op: 'eq', args: [{ attr: 'Estado' }, { literal: 'Activo' }] },
        { op: 'gt', args: [{ attr: 'Monto' }, { literal: 100 }] }
      ]
    };
    expect(explicarCondicion(c)).toBe('(Estado es igual a "Activo") Y (Monto es mayor que 100)');
  });

  it('traduce not envolviendo la condición negada', () => {
    const c: Condicion = { op: 'not', args: [{ op: 'eq', args: [{ attr: 'Estado' }, { literal: 'Activo' }] }] };
    expect(explicarCondicion(c)).toBe('NO ((Estado es igual a "Activo"))');
  });

  it('traduce condiciones anidadas de tres niveles', () => {
    const c: Condicion = {
      op: 'or',
      args: [
        { op: 'gt', args: [{ attr: 'Monto' }, { literal: 1000 }] },
        {
          op: 'and',
          args: [
            { op: 'eq', args: [{ attr: 'Estado' }, { literal: 'Activo' }] },
            { op: 'notEmpty', args: [{ attr: 'Justificacion' }] }
          ]
        }
      ]
    };
    expect(explicarCondicion(c)).toBe('(Monto es mayor que 1000) O ((Estado es igual a "Activo") Y (Justificacion no está vacío))');
  });

  it('usa el nombre del operador tal cual cuando no tiene etiqueta registrada', () => {
    const c: Condicion = { op: 'operadorDesconocido', args: [{ attr: 'X' }, { literal: 1 }] };
    expect(explicarCondicion(c)).toBe('X operadorDesconocido 1');
  });
});
