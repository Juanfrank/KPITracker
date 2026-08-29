import { describe, expect, it } from 'vitest';
import { agregar, tipoAgregacionBaseValido, tipoAgregacionValido } from '@domain/index';
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

  it('tipoAgregacionValido() reconoce las 10 reglas (4 base + 6 de Batch Z, exclusivas de Cortes)', () => {
    for (const op of ['promedio', 'promedioPonderado', 'maximo', 'minimo', 'mejorValor', 'peorValor', 'suma', 'mediana', 'primerValor', 'ultimoValor']) {
      expect(tipoAgregacionValido(op)).toBe(true);
    }
    expect(tipoAgregacionValido('otraCosa')).toBe(false);
  });

  it('tipoAgregacionBaseValido() solo reconoce las 4 reglas base (Medición por categoría)', () => {
    expect(tipoAgregacionBaseValido('promedio')).toBe(true);
    expect(tipoAgregacionBaseValido('maximo')).toBe(true);
    expect(tipoAgregacionBaseValido('mediana')).toBe(false);
    expect(tipoAgregacionBaseValido('suma')).toBe(false);
  });

  describe('Batch Z — nuevas reglas de agregación (Cortes de medición)', () => {
    it('mejorValor/peorValor: igual que máximo/mínimo (sin campo de sentido en Indicador todavía)', () => {
      const entradas: EntradaAgregable[] = [{ valor: 5, tieneMeta: false }, { valor: 30, tieneMeta: false }, { valor: 12, tieneMeta: false }];
      expect(agregar('mejorValor', entradas)).toBe(30);
      expect(agregar('peorValor', entradas)).toBe(5);
    });

    it('suma: total simple, sin ponderar', () => {
      const entradas: EntradaAgregable[] = [{ valor: 10, tieneMeta: false }, { valor: 20, tieneMeta: false }, { valor: 5, tieneMeta: false }];
      expect(agregar('suma', entradas)).toBe(35);
    });

    it('mediana: impar toma el del medio, par promedia los dos centrales', () => {
      const impares: EntradaAgregable[] = [{ valor: 1, tieneMeta: false }, { valor: 9, tieneMeta: false }, { valor: 5, tieneMeta: false }];
      expect(agregar('mediana', impares)).toBe(5);
      const pares: EntradaAgregable[] = [
        { valor: 1, tieneMeta: false }, { valor: 2, tieneMeta: false }, { valor: 3, tieneMeta: false }, { valor: 4, tieneMeta: false }
      ];
      expect(agregar('mediana', pares)).toBe(2.5);
    });

    it('primerValor/ultimoValor: respetan el ORDEN de las entradas tal como llegan (cronológico en Cortes)', () => {
      const entradas: EntradaAgregable[] = [{ valor: 100, tieneMeta: false }, { valor: 200, tieneMeta: false }, { valor: 50, tieneMeta: false }];
      expect(agregar('primerValor', entradas)).toBe(100);
      expect(agregar('ultimoValor', entradas)).toBe(50);
    });
  });
});
