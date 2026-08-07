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

/** Fila de detalle completo (una sola desagregación en estos fixtures: siempre !esGeneral). */
function detalle(valor: number | null): FilaValor {
  return { esGeneral: false, esDetalleCompleto: true, valor };
}

function general(valor: number | null): FilaValor {
  return { esGeneral: true, esDetalleCompleto: false, valor };
}

describe('calcularAgregadosCaptura', () => {
  it('calcula General, Máximo, Mínimo, Suma y Promedio de las desagregaciones (excluyendo la fila General)', () => {
    const filas: FilaValor[] = [general(80), detalle(70), detalle(90), detalle(null)];
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
    const agregados = calcularAgregadosCaptura([general(null)]);
    expect(agregados.general).toBeNull();
    expect(agregados.maximo).toBeNull();
    expect(agregados.minimo).toBeNull();
    expect(agregados.promedio).toBeNull();
    expect(agregados.suma).toBe(0);
  });

  it('ignora filas de subtotal (nivel intermedio del cubo): no cuentan como detalle completo', () => {
    // 2 desagregaciones: un subtotal de una sola (60, con la otra enrollada) no debe
    // sumarse junto al detalle completo que ya lo explica (25+35=60) — solo el detalle cuenta.
    const filas: FilaValor[] = [
      general(60),
      { esGeneral: false, esDetalleCompleto: false, valor: 60 }, // subtotal — se ignora
      detalle(25),
      detalle(35)
    ];
    const agregados = calcularAgregadosCaptura(filas);
    expect(agregados.suma).toBe(60); // 25+35, no 25+35+60
    expect(agregados.maximo).toBe(35);
    expect(agregados.cantidadConValor).toBe(4); // sí cuenta para "cuántas celdas tienen valor"
  });
});

describe('evaluarValidacionesCaptura', () => {
  it('advierte por defecto cuando el General es menor que el máximo de las desagregaciones', () => {
    const agregados = calcularAgregadosCaptura([general(50), detalle(80)]);
    const advertencias = evaluarValidacionesCaptura(agregados, []);
    expect(advertencias.some((a) => a.includes('menor que el máximo'))).toBe(true);
  });

  it('no advierte por defecto cuando el General es mayor o igual al máximo', () => {
    const agregados = calcularAgregadosCaptura([general(90), detalle(80)]);
    expect(evaluarValidacionesCaptura(agregados, [])).toHaveLength(0);
  });

  it('evalúa reglas ValidacionCruzada activas de entidad Recoleccion sobre los agregados', () => {
    const agregados = calcularAgregadosCaptura([general(30), detalle(10)]);
    const r = regla({
      mensajeError: 'El promedio debe superar 50.',
      condicion: { op: 'gt', args: [{ attr: 'Promedio' }, { literal: 50 }] }
    });
    const advertencias = evaluarValidacionesCaptura(agregados, [r]);
    expect(advertencias).toContain('El promedio debe superar 50.');
  });

  it('ignora reglas inactivas', () => {
    const agregados = calcularAgregadosCaptura([general(30)]);
    const r = regla({ activa: false, condicion: { op: 'gt', args: [{ attr: 'General' }, { literal: 1000 }] } });
    expect(evaluarValidacionesCaptura(agregados, [r])).toHaveLength(0);
  });

  it('ignora reglas de otra entidad o de otro tipo', () => {
    const agregados = calcularAgregadosCaptura([general(30)]);
    const deOtraEntidad = regla({ entidad: 'Indicador', condicion: { op: 'gt', args: [{ attr: 'General' }, { literal: 1000 }] } });
    const deOtroTipo = regla({ tipo: 'Visibilidad', condicion: { op: 'gt', args: [{ attr: 'General' }, { literal: 1000 }] } });
    expect(evaluarValidacionesCaptura(agregados, [deOtraEntidad, deOtroTipo])).toHaveLength(0);
  });

  it('usa un mensaje por defecto cuando la regla no define mensajeError', () => {
    const agregados = calcularAgregadosCaptura([general(30)]);
    const r = regla({ nombre: 'Tope mínimo', condicion: { op: 'gt', args: [{ attr: 'General' }, { literal: 1000 }] } });
    const advertencias = evaluarValidacionesCaptura(agregados, [r]);
    expect(advertencias).toContain('No se cumple la regla "Tope mínimo".');
  });
});
