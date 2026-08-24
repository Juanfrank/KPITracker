import { describe, expect, it } from 'vitest';
import { metaVigenteParaPeriodo } from '@domain/services/ResolucionMetaPeriodo';
import { crearPeriodo } from '@domain/value-objects/Periodo';
import { Periodicidad } from '@domain/value-objects/Periodicidad';
import type { Meta } from '@domain/entities/Meta';

function meta(parcial: Partial<Meta> = {}): Meta {
  return {
    id: parcial.id ?? 'm1',
    indicadorId: 'ind-1',
    claveDesagregacion: 'GENERAL',
    valor: 100,
    periodicidadMedicion: Periodicidad.Mensual,
    periodicidadPersonalizadaId: null,
    metodoCalculo: 'Promedio',
    anioVigencia: 2026,
    creadoEn: '',
    actualizadoEn: '',
    ...parcial
  };
}

describe('metaVigenteParaPeriodo', () => {
  it('calza 1 a 1 cuando la meta y el período comparten periodicidad', () => {
    const enero = crearPeriodo(2026, Periodicidad.Mensual, 1);
    const m = meta({ periodicidadMedicion: Periodicidad.Mensual, valor: 50 });
    expect(metaVigenteParaPeriodo([m], 'GENERAL', enero, new Map())).toEqual(m);
  });

  it('una meta Trimestral cubre los 3 meses de CADA trimestre del año (una sola meta, recurrente) aunque el indicador capture Mensual', () => {
    const m = meta({ periodicidadMedicion: Periodicidad.Trimestral, valor: 300 });

    const febrero = crearPeriodo(2026, Periodicidad.Mensual, 2); // T1
    const mayo = crearPeriodo(2026, Periodicidad.Mensual, 5); // T2
    expect(metaVigenteParaPeriodo([m], 'GENERAL', febrero, new Map())).toEqual(m);
    expect(metaVigenteParaPeriodo([m], 'GENERAL', mayo, new Map())).toEqual(m);

    const eneroOtroAnio = crearPeriodo(2027, Periodicidad.Mensual, 1); // fuera del año de vigencia de la meta
    expect(metaVigenteParaPeriodo([m], 'GENERAL', eneroOtroAnio, new Map())).toBeNull();
  });

  it('ignora metas de otra clave de desagregación o de otro año', () => {
    const enero = crearPeriodo(2026, Periodicidad.Mensual, 1);
    const otraClave = meta({ claveDesagregacion: 'lista-1=M', valor: 10 });
    const otroAnio = meta({ anioVigencia: 2025, valor: 20 });
    expect(metaVigenteParaPeriodo([otraClave, otroAnio], 'GENERAL', enero, new Map())).toBeNull();
  });

  it('cuando dos metas calzan (una Anual y otra Mensual), gana la de segmento más angosto', () => {
    const marzo = crearPeriodo(2026, Periodicidad.Mensual, 3);
    const anual = meta({ id: 'anual', periodicidadMedicion: Periodicidad.Anual, valor: 1200 });
    const mensual = meta({ id: 'mensual', periodicidadMedicion: Periodicidad.Mensual, valor: 100 });
    const resultado = metaVigenteParaPeriodo([anual, mensual], 'GENERAL', marzo, new Map());
    expect(resultado?.id).toBe('mensual');
  });

  it('devuelve null si no hay ninguna meta configurada para ese año/clave', () => {
    const enero = crearPeriodo(2026, Periodicidad.Mensual, 1);
    expect(metaVigenteParaPeriodo([], 'GENERAL', enero, new Map())).toBeNull();
  });
});
