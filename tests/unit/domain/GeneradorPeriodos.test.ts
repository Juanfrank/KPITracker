import { describe, expect, it } from 'vitest';
import { GeneradorPeriodos } from '@domain/services/GeneradorPeriodos';
import { Periodicidad } from '@domain/value-objects/Periodicidad';
import { NoImplementadoError } from '@domain/errors/errores';

const generador = new GeneradorPeriodos();

describe('GeneradorPeriodos', () => {
  it('genera 12 períodos mensuales con etiquetas de mes', () => {
    const periodos = generador.periodosDelAnio(2025, Periodicidad.Mensual);
    expect(periodos).toHaveLength(12);
    expect(periodos[0]?.etiqueta).toBe('Enero 2025');
    expect(periodos[0]?.fechaInicio).toBe('2025-01-01');
    expect(periodos[0]?.fechaFin).toBe('2025-01-31');
    expect(periodos[11]?.etiqueta).toBe('Diciembre 2025');
  });

  it('genera 4 trimestres con fechas correctas', () => {
    const periodos = generador.periodosDelAnio(2025, Periodicidad.Trimestral);
    expect(periodos.map((p) => p.etiqueta)).toEqual(['T1 2025', 'T2 2025', 'T3 2025', 'T4 2025']);
    expect(periodos[1]?.fechaInicio).toBe('2025-04-01');
    expect(periodos[1]?.fechaFin).toBe('2025-06-30');
  });

  it('genera semestres, bimestres, cuatrimestres y años', () => {
    expect(generador.periodosDelAnio(2025, Periodicidad.Semestral)).toHaveLength(2);
    expect(generador.periodosDelAnio(2025, Periodicidad.Bimestral)).toHaveLength(6);
    expect(generador.periodosDelAnio(2025, Periodicidad.Cuatrimestral)).toHaveLength(3);
    const anual = generador.periodosDelAnio(2025, Periodicidad.Anual);
    expect(anual).toHaveLength(1);
    expect(anual[0]?.etiqueta).toBe('2025');
    expect(anual[0]?.fechaFin).toBe('2025-12-31');
  });

  it('respeta el año bisiesto en febrero', () => {
    const feb = generador.periodosDelAnio(2024, Periodicidad.Mensual)[1];
    expect(feb?.fechaFin).toBe('2024-02-29');
  });

  it('la periodicidad Personalizada lanza NoImplementadoError', () => {
    expect(() => generador.periodosDelAnio(2025, Periodicidad.Personalizada)).toThrow(NoImplementadoError);
  });

  it('periodosDisponibles abarca desde el año inicial y excluye períodos futuros', () => {
    const periodos = generador.periodosDisponibles(2024, Periodicidad.Trimestral, '2025-05-15');
    // 2024 completo (4) + T1 y T2 2025 (iniciados) = 6
    expect(periodos).toHaveLength(6);
    expect(periodos[periodos.length - 1]?.etiqueta).toBe('T2 2025');
  });

  it('periodosCerrados excluye el período en curso', () => {
    const periodos = generador.periodosCerrados(2025, Periodicidad.Mensual, '2025-03-10');
    expect(periodos.map((p) => p.etiqueta)).toEqual(['Enero 2025', 'Febrero 2025']);
  });
});
