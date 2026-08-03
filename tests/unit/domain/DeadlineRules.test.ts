import { describe, expect, it } from 'vitest';
import { crearRegistroReglasFechaLimite } from '@domain/deadline-rules/reglasBase';
import { crearPeriodo } from '@domain/value-objects/Periodo';
import { Periodicidad } from '@domain/value-objects/Periodicidad';

const registro = crearRegistroReglasFechaLimite();
// Enero 2025 cierra el 2025-01-31; el mes de llenado es febrero 2025.
const enero2025 = crearPeriodo(2025, Periodicidad.Mensual, 1);

describe('Reglas de fecha límite', () => {
  it('DiaFijoDelMes: día 10 del mes siguiente al cierre', () => {
    expect(registro.calcular({ tipo: 'DiaFijoDelMes', parametros: { dia: 10 } }, enero2025)).toBe('2025-02-10');
  });

  it('DiaFijoDelMes ajusta al último día cuando el mes es más corto', () => {
    expect(registro.calcular({ tipo: 'DiaFijoDelMes', parametros: { dia: 31 } }, enero2025)).toBe('2025-02-28');
  });

  it('NEsimoDiaSemana: primer lunes de febrero 2025', () => {
    // Febrero 2025: el día 1 es sábado; primer lunes = 3.
    expect(registro.calcular({ tipo: 'NEsimoDiaSemana', parametros: { n: 1, diaSemana: 1 } }, enero2025)).toBe('2025-02-03');
  });

  it('NEsimoDiaSemana: segundo martes de febrero 2025', () => {
    expect(registro.calcular({ tipo: 'NEsimoDiaSemana', parametros: { n: 2, diaSemana: 2 } }, enero2025)).toBe('2025-02-11');
  });

  it('UltimoDiaSemana: último viernes de febrero 2025', () => {
    expect(registro.calcular({ tipo: 'UltimoDiaSemana', parametros: { diaSemana: 5 } }, enero2025)).toBe('2025-02-28');
  });

  it('PrimerDiaHabil: 1 feb 2025 es sábado, primer hábil es lunes 3', () => {
    expect(registro.calcular({ tipo: 'PrimerDiaHabil', parametros: {} }, enero2025)).toBe('2025-02-03');
  });

  it('UltimoDiaHabil de febrero 2025 (28 es viernes)', () => {
    expect(registro.calcular({ tipo: 'UltimoDiaHabil', parametros: {} }, enero2025)).toBe('2025-02-28');
  });

  it('NDiasAntesCierre: 5 días antes del 31 de enero', () => {
    expect(registro.calcular({ tipo: 'NDiasAntesCierre', parametros: { dias: 5 } }, enero2025)).toBe('2025-01-26');
  });

  it('una regla no registrada produce error claro', () => {
    expect(() => registro.calcular({ tipo: 'Inexistente', parametros: {} }, enero2025)).toThrow(/no registrada/);
  });

  it('permite registrar reglas nuevas sin modificar las existentes (OCP)', () => {
    registro.registrar({
      tipo: 'DiaQuince',
      etiqueta: 'Siempre el 15',
      parametros: [],
      calcular: (p) => `${p.anio}-${String(p.numero + 1).padStart(2, '0')}-15`
    });
    expect(registro.calcular({ tipo: 'DiaQuince', parametros: {} }, enero2025)).toBe('2025-02-15');
  });
});
