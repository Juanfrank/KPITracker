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
    periodoId: parcial.periodoId ?? null,
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

  it('un override de período puntual (Configuración de Metas) gana sobre la meta recurrente de igual periodicidad', () => {
    const marzo = crearPeriodo(2026, Periodicidad.Mensual, 3);
    const recurrente = meta({ id: 'recurrente', periodicidadMedicion: Periodicidad.Mensual, valor: 100 });
    const override = meta({ id: 'override', periodicidadMedicion: Periodicidad.Mensual, valor: 150, periodoId: marzo.id });
    const resultado = metaVigenteParaPeriodo([recurrente, override], 'GENERAL', marzo, new Map());
    expect(resultado?.id).toBe('override');

    // El override solo aplica a SU período puntual — otro mes cae de vuelta a la recurrente.
    const abril = crearPeriodo(2026, Periodicidad.Mensual, 4);
    expect(metaVigenteParaPeriodo([recurrente, override], 'GENERAL', abril, new Map())?.id).toBe('recurrente');
  });

  it('un override de período puntual con periodicidad más ancha (Trimestral) igual se refleja por contención en cada mes de ese trimestre', () => {
    const t1 = crearPeriodo(2026, Periodicidad.Trimestral, 1);
    const overrideT1 = meta({ id: 'override-t1', periodicidadMedicion: Periodicidad.Trimestral, valor: 300, periodoId: t1.id });

    const febrero = crearPeriodo(2026, Periodicidad.Mensual, 2);
    const abril = crearPeriodo(2026, Periodicidad.Mensual, 4); // fuera de T1
    expect(metaVigenteParaPeriodo([overrideT1], 'GENERAL', febrero, new Map())?.id).toBe('override-t1');
    expect(metaVigenteParaPeriodo([overrideT1], 'GENERAL', abril, new Map())).toBeNull();
  });

  it('un override Mensual puntual sigue ganando sobre una meta recurrente Trimestral más ancha (gana el segmento más angosto, no solo "es override")', () => {
    const febrero = crearPeriodo(2026, Periodicidad.Mensual, 2);
    const recurrenteTrimestral = meta({ id: 'trimestral', periodicidadMedicion: Periodicidad.Trimestral, valor: 300 });
    const overrideMensual = meta({ id: 'mensual-override', periodicidadMedicion: Periodicidad.Mensual, valor: 90, periodoId: febrero.id });
    const resultado = metaVigenteParaPeriodo([recurrenteTrimestral, overrideMensual], 'GENERAL', febrero, new Map());
    expect(resultado?.id).toBe('mensual-override');
  });
});
