import { describe, expect, it } from 'vitest';
import { calcularAgregadosCaptura, evaluarValidacionesCaptura } from '@domain/services/ValidacionCaptura';
import type { FilaValor } from '@domain/services/ValidacionCaptura';
import type { ReglaNegocio } from '@domain/entities/ReglaNegocio';

function regla(parcial: Partial<ReglaNegocio> & { condicion: ReglaNegocio['condicion'] }): ReglaNegocio {
  return {
    id: 'r1', nombre: 'Regla', descripcion: '', tipo: 'ValidacionCruzada', entidad: 'Recoleccion',
    atributoObjetivoId: null, mensajeError: null, activa: true, eliminado: false,
    creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-01-01T00:00:00Z',
    ...parcial
  };
}

describe('calcularAgregadosCaptura', () => {
  it('calcula General, Máximo, Mínimo, Suma y Promedio de las desagregaciones (excluyendo la fila General)', () => {
    const filas: FilaValor[] = [
      { esGeneral: true, valor: 80 },
      { esGeneral: false, valor: 70 },
      { esGeneral: false, valor: 90 },
      { esGeneral: false, valor: null }
    ];
    const agregados = calcularAgregadosCaptura(filas);
    expect(agregados.general).toBe(80);
    expect(agregados.maximo).toBe(90);
    expect(agregados.minimo).toBe(70);
    expect(agregados.suma).toBe(160);
    expect(agregados.promedio).toBe(80);
    expect(agregados.cantidadConValor).toBe(3);
    expect(agregados.totalCombinaciones).toBe(4);
  });

  it('retorna null en los agregados cuando no hay desagregaciones con valor', () => {
    const agregados = calcularAgregadosCaptura([{ esGeneral: true, valor: null }]);
    expect(agregados.general).toBeNull();
    expect(agregados.maximo).toBeNull();
    expect(agregados.minimo).toBeNull();
    expect(agregados.promedio).toBeNull();
    expect(agregados.suma).toBe(0);
  });
});

describe('evaluarValidacionesCaptura', () => {
  it('advierte por defecto cuando el General es menor que el máximo de las desagregaciones', () => {
    const agregados = calcularAgregadosCaptura([
      { esGeneral: true, valor: 50 },
      { esGeneral: false, valor: 80 }
    ]);
    const advertencias = evaluarValidacionesCaptura(agregados, []);
    expect(advertencias.some((a) => a.includes('menor que el máximo'))).toBe(true);
  });

  it('no advierte por defecto cuando el General es mayor o igual al máximo', () => {
    const agregados = calcularAgregadosCaptura([
      { esGeneral: true, valor: 90 },
      { esGeneral: false, valor: 80 }
    ]);
    expect(evaluarValidacionesCaptura(agregados, [])).toHaveLength(0);
  });

  it('evalúa reglas ValidacionCruzada activas de entidad Recoleccion sobre los agregados', () => {
    const agregados = calcularAgregadosCaptura([
      { esGeneral: true, valor: 30 },
      { esGeneral: false, valor: 10 }
    ]);
    const r = regla({
      mensajeError: 'El promedio debe superar 50.',
      condicion: { op: 'gt', args: [{ attr: 'Promedio' }, { literal: 50 }] }
    });
    const advertencias = evaluarValidacionesCaptura(agregados, [r]);
    expect(advertencias).toContain('El promedio debe superar 50.');
  });

  it('ignora reglas inactivas', () => {
    const agregados = calcularAgregadosCaptura([{ esGeneral: true, valor: 30 }]);
    const r = regla({ activa: false, condicion: { op: 'gt', args: [{ attr: 'General' }, { literal: 1000 }] } });
    expect(evaluarValidacionesCaptura(agregados, [r])).toHaveLength(0);
  });

  it('ignora reglas de otra entidad o de otro tipo', () => {
    const agregados = calcularAgregadosCaptura([{ esGeneral: true, valor: 30 }]);
    const deOtraEntidad = regla({ entidad: 'Indicador', condicion: { op: 'gt', args: [{ attr: 'General' }, { literal: 1000 }] } });
    const deOtroTipo = regla({ tipo: 'Visibilidad', condicion: { op: 'gt', args: [{ attr: 'General' }, { literal: 1000 }] } });
    expect(evaluarValidacionesCaptura(agregados, [deOtraEntidad, deOtroTipo])).toHaveLength(0);
  });

  it('usa un mensaje por defecto cuando la regla no define mensajeError', () => {
    const agregados = calcularAgregadosCaptura([{ esGeneral: true, valor: 30 }]);
    const r = regla({ nombre: 'Tope mínimo', condicion: { op: 'gt', args: [{ attr: 'General' }, { literal: 1000 }] } });
    const advertencias = evaluarValidacionesCaptura(agregados, [r]);
    expect(advertencias).toContain('No se cumple la regla "Tope mínimo".');
  });
});
