import { describe, expect, it } from 'vitest';
import { agregar, tipoAgregacionValido } from '@domain/index';
import type { EntradaAgregable } from '@domain/index';

describe('AgregacionMedicion — agregar() (Batch Y)', () => {
  it('devuelve null si no hay entradas', () => {
    expect(agregar('promedio', [])).toBeNull();
  });

  it('promedio simple', () => {
    const entradas: EntradaAgregable[] = [{ valor: 10, tieneMeta: false }, { valor: 20, tieneMeta: false }, { valor: 30, tieneMeta: false }];
    expect(agregar('promedio', entradas)).toBe(20);
  });

  it('máximo y mínimo', () => {
    const entradas: EntradaAgregable[] = [{ valor: 5, tieneMeta: false }, { valor: 30, tieneMeta: true }, { valor: 12, tieneMeta: false }];
    expect(agregar('maximo', entradas)).toBe(30);
    expect(agregar('minimo', entradas)).toBe(5);
  });

  it('promedio ponderado: solo cuentan las entradas con meta configurada', () => {
    const entradas: EntradaAgregable[] = [
      { valor: 10, tieneMeta: true },
      { valor: 1000, tieneMeta: false },
      { valor: 20, tieneMeta: true }
    ];
    expect(agregar('promedioPonderado', entradas)).toBe(15);
  });

  it('promedio ponderado: si ninguna entrada tiene meta, cae a promedio simple (nunca null)', () => {
    const entradas: EntradaAgregable[] = [{ valor: 10, tieneMeta: false }, { valor: 30, tieneMeta: false }];
    expect(agregar('promedioPonderado', entradas)).toBe(20);
  });

  it('peso explícito ("pesa doble"): multiplica su influencia en el promedio', () => {
    const entradas: EntradaAgregable[] = [{ valor: 10, tieneMeta: false, peso: 1 }, { valor: 40, tieneMeta: false, peso: 3 }];
    // (10*1 + 40*3) / (1+3) = 130/4 = 32.5
    expect(agregar('promedio', entradas)).toBe(32.5);
  });

  it('tipoAgregacionValido() reconoce solo las 4 reglas del catálogo', () => {
    expect(tipoAgregacionValido('promedio')).toBe(true);
    expect(tipoAgregacionValido('promedioPonderado')).toBe(true);
    expect(tipoAgregacionValido('maximo')).toBe(true);
    expect(tipoAgregacionValido('minimo')).toBe(true);
    expect(tipoAgregacionValido('otraCosa')).toBe(false);
  });
});
