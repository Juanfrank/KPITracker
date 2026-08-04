import { describe, expect, it } from 'vitest';
import { validarDefinicionPeriodicidad } from '@domain/entities/DefinicionPeriodicidad';
import type { CortePeriodicidad } from '@domain/entities/DefinicionPeriodicidad';
import { GeneradorPeriodos } from '@domain/services/GeneradorPeriodos';
import { Periodicidad } from '@domain/value-objects/Periodicidad';
import type { DefinicionPeriodicidad } from '@domain/entities/DefinicionPeriodicidad';

const cortesValidos: CortePeriodicidad[] = [
  { numero: 1, etiqueta: 'Corte 1', mesInicio: 1, mesFin: 5 },
  { numero: 2, etiqueta: 'Corte 2', mesInicio: 6, mesFin: 8 },
  { numero: 3, etiqueta: 'Corte 3', mesInicio: 9, mesFin: 12 }
];

describe('validarDefinicionPeriodicidad', () => {
  it('acepta una definición que cubre el año completo sin huecos ni solapes', () => {
    expect(validarDefinicionPeriodicidad(cortesValidos)).toHaveLength(0);
  });

  it('rechaza una definición vacía', () => {
    expect(validarDefinicionPeriodicidad([])).toEqual(['La definición debe tener al menos un corte.']);
  });

  it('detecta un hueco entre cortes', () => {
    const conHueco: CortePeriodicidad[] = [
      { numero: 1, etiqueta: 'A', mesInicio: 1, mesFin: 4 },
      { numero: 2, etiqueta: 'B', mesInicio: 6, mesFin: 12 } // falta mayo
    ];
    const errores = validarDefinicionPeriodicidad(conHueco);
    expect(errores.some((e) => e.includes('hueco o solape'))).toBe(true);
  });

  it('detecta un solape entre cortes', () => {
    const conSolape: CortePeriodicidad[] = [
      { numero: 1, etiqueta: 'A', mesInicio: 1, mesFin: 6 },
      { numero: 2, etiqueta: 'B', mesInicio: 5, mesFin: 12 } // mayo se repite
    ];
    const errores = validarDefinicionPeriodicidad(conSolape);
    expect(errores.some((e) => e.includes('hueco o solape'))).toBe(true);
  });

  it('exige que el primer corte inicie en enero', () => {
    const noComienzaEnero: CortePeriodicidad[] = [{ numero: 1, etiqueta: 'A', mesInicio: 2, mesFin: 12 }];
    expect(validarDefinicionPeriodicidad(noComienzaEnero)).toContain('El primer corte debe iniciar en enero (mes 1).');
  });

  it('exige que el último corte finalice en diciembre', () => {
    const noTerminaDiciembre: CortePeriodicidad[] = [{ numero: 1, etiqueta: 'A', mesInicio: 1, mesFin: 11 }];
    expect(validarDefinicionPeriodicidad(noTerminaDiciembre)).toContain('El último corte debe finalizar en diciembre (mes 12).');
  });

  it('exige numeración consecutiva desde 1', () => {
    const numeracionMala: CortePeriodicidad[] = [
      { numero: 1, etiqueta: 'A', mesInicio: 1, mesFin: 6 },
      { numero: 3, etiqueta: 'B', mesInicio: 7, mesFin: 12 }
    ];
    const errores = validarDefinicionPeriodicidad(numeracionMala);
    expect(errores.some((e) => e.includes('consecutivos'))).toBe(true);
  });

  it('rechaza meses fuera de rango', () => {
    const fueraDeRango: CortePeriodicidad[] = [{ numero: 1, etiqueta: 'A', mesInicio: 0, mesFin: 13 }];
    const errores = validarDefinicionPeriodicidad(fueraDeRango);
    expect(errores.some((e) => e.includes('fuera de rango'))).toBe(true);
  });

  it('rechaza un corte cuyo mes final es anterior al inicial', () => {
    const invertido: CortePeriodicidad[] = [{ numero: 1, etiqueta: 'A', mesInicio: 8, mesFin: 3 }];
    const errores = validarDefinicionPeriodicidad(invertido);
    expect(errores.some((e) => e.includes('mes final no puede ser anterior'))).toBe(true);
  });

  it('acepta un único corte que cubre todo el año (equivalente a Anual)', () => {
    expect(validarDefinicionPeriodicidad([{ numero: 1, etiqueta: 'Año completo', mesInicio: 1, mesFin: 12 }])).toHaveLength(0);
  });
});

describe('GeneradorPeriodos con periodicidad Personalizada', () => {
  const definicion: DefinicionPeriodicidad = {
    id: 'def-1', nombre: 'Especial', descripcion: '', cortes: cortesValidos,
    creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-01-01T00:00:00Z'
  };
  const generador = new GeneradorPeriodos();

  it('periodosCerrados respeta los cortes de la definición', () => {
    const cerrados = generador.periodosCerrados(2025, Periodicidad.Personalizada, '2025-07-01', definicion);
    // El primer corte (ene-mayo) ya cerró; el segundo (jun-ago) sigue abierto el 1 de julio.
    expect(cerrados).toHaveLength(1);
    expect(cerrados[0]?.etiqueta).toBe('Corte 1 2025');
  });

  it('periodosDisponibles incluye los cortes ya iniciados', () => {
    const disponibles = generador.periodosDisponibles(2025, Periodicidad.Personalizada, '2025-07-01', definicion);
    expect(disponibles.map((p) => p.etiqueta)).toEqual(['Corte 1 2025', 'Corte 2 2025']);
  });
});
