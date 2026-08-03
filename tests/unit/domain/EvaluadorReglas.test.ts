import { describe, expect, it } from 'vitest';
import { EvaluadorReglas } from '@domain/rules/EvaluadorReglas';
import type { Condicion, ContextoEvaluacion } from '@domain/rules/Condicion';

function contexto(valores: Record<string, string | number | boolean | null>): ContextoEvaluacion {
  return { obtenerAtributo: (nombre) => valores[nombre] ?? null };
}

const evaluador = new EvaluadorReglas();

describe('EvaluadorReglas (motor declarativo)', () => {
  it('mostrar únicamente si Estado = Activo', () => {
    const regla: Condicion = { op: 'eq', args: [{ attr: 'Estado' }, { literal: 'Activo' }] };
    expect(evaluador.evaluar(regla, contexto({ Estado: 'Activo' }))).toBe(true);
    expect(evaluador.evaluar(regla, contexto({ Estado: 'Inactivo' }))).toBe(false);
  });

  it('obligatorio únicamente si Monto > 5000', () => {
    const regla: Condicion = { op: 'gt', args: [{ attr: 'Monto' }, { literal: 5000 }] };
    expect(evaluador.evaluar(regla, contexto({ Monto: 6000 }))).toBe(true);
    expect(evaluador.evaluar(regla, contexto({ Monto: 5000 }))).toBe(false);
    expect(evaluador.evaluar(regla, contexto({ Monto: null }))).toBe(false);
  });

  it('FechaFinal debe ser mayor que FechaInicio (comparación entre atributos)', () => {
    const regla: Condicion = { op: 'gt', args: [{ attr: 'FechaFinal' }, { attr: 'FechaInicio' }] };
    expect(evaluador.evaluar(regla, contexto({ FechaInicio: '2025-01-01', FechaFinal: '2025-06-30' }))).toBe(true);
    expect(evaluador.evaluar(regla, contexto({ FechaInicio: '2025-06-30', FechaFinal: '2025-01-01' }))).toBe(false);
  });

  it('Monto debe ser menor que Presupuesto', () => {
    const regla: Condicion = { op: 'lt', args: [{ attr: 'Monto' }, { attr: 'Presupuesto' }] };
    expect(evaluador.evaluar(regla, contexto({ Monto: 100, Presupuesto: 500 }))).toBe(true);
    expect(evaluador.evaluar(regla, contexto({ Monto: 900, Presupuesto: 500 }))).toBe(false);
  });

  it('condiciones compuestas con and/or/not anidadas', () => {
    const regla: Condicion = {
      op: 'and',
      args: [
        { op: 'eq', args: [{ attr: 'Estado' }, { literal: 'Activo' }] },
        {
          op: 'or',
          args: [
            { op: 'gt', args: [{ attr: 'Monto' }, { literal: 1000 }] },
            { op: 'notEmpty', args: [{ attr: 'Justificacion' }] }
          ]
        }
      ]
    };
    expect(evaluador.evaluar(regla, contexto({ Estado: 'Activo', Monto: 2000, Justificacion: null }))).toBe(true);
    expect(evaluador.evaluar(regla, contexto({ Estado: 'Activo', Monto: 10, Justificacion: 'ok' }))).toBe(true);
    expect(evaluador.evaluar(regla, contexto({ Estado: 'Activo', Monto: 10, Justificacion: null }))).toBe(false);
    expect(evaluador.evaluar(regla, contexto({ Estado: 'Inactivo', Monto: 2000, Justificacion: 'ok' }))).toBe(false);
  });

  it('between, contains, matches e isEmpty', () => {
    expect(evaluador.evaluar({ op: 'between', args: [{ attr: 'x' }, { literal: 1 }, { literal: 10 }] }, contexto({ x: 5 }))).toBe(true);
    expect(evaluador.evaluar({ op: 'contains', args: [{ attr: 'n' }, { literal: 'juz' }] }, contexto({ n: 'Juzgado de Paz' }))).toBe(true);
    expect(evaluador.evaluar({ op: 'matches', args: [{ attr: 'c' }, { literal: '^[A-Z]{3}-\\d+$' }] }, contexto({ c: 'ABC-123' }))).toBe(true);
    expect(evaluador.evaluar({ op: 'isEmpty', args: [{ attr: 'v' }] }, contexto({ v: '  ' }))).toBe(true);
  });

  it('operador desconocido y aridad incorrecta producen errores claros', () => {
    expect(() => evaluador.evaluar({ op: 'xyz', args: [] }, contexto({}))).toThrow(/no registrado/);
    expect(() => evaluador.evaluar({ op: 'eq', args: [{ literal: 1 }] }, contexto({}))).toThrow(/espera 2/);
  });

  it('permite registrar operadores nuevos sin tocar el evaluador (OCP)', () => {
    const propio = new EvaluadorReglas();
    propio.registrarOperador({
      nombre: 'esPar',
      etiqueta: 'Es par',
      aridad: 1,
      evaluar: (v) => typeof v[0] === 'number' && v[0] % 2 === 0
    });
    expect(propio.evaluar({ op: 'esPar', args: [{ attr: 'n' }] }, contexto({ n: 4 }))).toBe(true);
  });
});
