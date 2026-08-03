import { describe, expect, it } from 'vitest';
import { CalculadoraEstados } from '@domain/services/CalculadoraEstados';
import type { DatosLevantamientoPeriodo } from '@domain/services/CalculadoraEstados';
import { crearRegistroReglasFechaLimite } from '@domain/deadline-rules/reglasBase';
import { crearPeriodo } from '@domain/value-objects/Periodo';
import { Periodicidad } from '@domain/value-objects/Periodicidad';

const calc = new CalculadoraEstados(crearRegistroReglasFechaLimite());
// Enero 2025; fecha límite: día 10 de febrero.
const regla = { tipo: 'DiaFijoDelMes', parametros: { dia: 10 } };
const enero = crearPeriodo(2025, Periodicidad.Mensual, 1);

function datos(parcial: Partial<DatosLevantamientoPeriodo> = {}): DatosLevantamientoPeriodo {
  return {
    periodo: enero,
    fechaCorte: null,
    totalCombinaciones: 5,
    combinacionesConValor: 0,
    ultimaActualizacion: null,
    ...parcial
  };
}

describe('CalculadoraEstados (lógica de pendientes dinámica)', () => {
  it('período aún abierto => NoAplica', () => {
    const e = calc.calcularEstadoPeriodo(datos(), regla, '2025-01-15', true);
    expect(e.estado).toBe('NoAplica');
  });

  it('período cerrado sin datos y dentro de plazo => Pendiente', () => {
    const e = calc.calcularEstadoPeriodo(datos(), regla, '2025-02-05', true);
    expect(e.estado).toBe('Pendiente');
    expect(e.fechaLimite).toBe('2025-02-10');
  });

  it('con datos parciales dentro de plazo => EnProgreso', () => {
    const e = calc.calcularEstadoPeriodo(datos({ combinacionesConValor: 2 }), regla, '2025-02-05', true);
    expect(e.estado).toBe('EnProgreso');
  });

  it('pasada la fecha límite sin completar => Vencido', () => {
    const e = calc.calcularEstadoPeriodo(datos({ combinacionesConValor: 2 }), regla, '2025-02-20', true);
    expect(e.estado).toBe('Vencido');
  });

  it('todas las combinaciones con valor y fecha de corte => Completo (aun después del límite)', () => {
    const e = calc.calcularEstadoPeriodo(
      datos({ combinacionesConValor: 5, fechaCorte: '2025-01-31' }),
      regla,
      '2025-03-01',
      true
    );
    expect(e.estado).toBe('Completo');
  });

  it('sin fecha de corte no puede estar Completo (la fecha de corte es obligatoria)', () => {
    const e = calc.calcularEstadoPeriodo(datos({ combinacionesConValor: 5 }), regla, '2025-02-05', true);
    expect(e.estado).toBe('EnProgreso');
  });

  it('indicador inactivo => NoAplica', () => {
    const e = calc.calcularEstadoPeriodo(datos(), regla, '2025-02-05', false);
    expect(e.estado).toBe('NoAplica');
  });

  it('periodoPendiente devuelve el primer período accionable', () => {
    const estados = [
      calc.calcularEstadoPeriodo(datos({ combinacionesConValor: 5, fechaCorte: '2025-01-31' }), regla, '2025-03-15', true),
      calc.calcularEstadoPeriodo(datos({ periodo: crearPeriodo(2025, Periodicidad.Mensual, 2) }), regla, '2025-03-15', true)
    ];
    expect(calc.periodoPendiente(estados)?.periodo.etiqueta).toBe('Febrero 2025');
  });
});
