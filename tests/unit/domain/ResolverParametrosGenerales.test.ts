import { describe, expect, it } from 'vitest';
import { ejemploParaFuente, resolverParametrosGenerales } from '@domain/services/ResolverParametrosGenerales';
import type { FuenteParametroGeneral, ParametroGeneral } from '@domain/entities/OrigenAutomatico';
import { Periodicidad } from '@domain/value-objects/Periodicidad';
import type { Periodo } from '@domain/value-objects/Periodo';

function periodoTrimestral(): Periodo {
  return {
    anio: 2026, periodicidad: Periodicidad.Trimestral, numero: 3,
    etiqueta: 'T3 2026', fechaInicio: '2026-07-01', fechaFin: '2026-09-30', id: '2026-Trimestral-03'
  };
}

describe('resolverParametrosGenerales', () => {
  it('resuelve un parámetro único al id del período', () => {
    const parametros: ParametroGeneral[] = [{ nombre: 'periodo', fuente: 'PeriodoId' }];
    const valores = resolverParametrosGenerales(parametros, periodoTrimestral());
    expect(valores.get('periodo')).toBe('2026-Trimestral-03');
  });

  it('resuelve un rango de fechas como dos parámetros separados', () => {
    const parametros: ParametroGeneral[] = [
      { nombre: 'desde', fuente: 'FechaInicio' },
      { nombre: 'hasta', fuente: 'FechaFin' }
    ];
    const valores = resolverParametrosGenerales(parametros, periodoTrimestral());
    expect(valores.get('desde')).toBe('2026-07-01');
    expect(valores.get('hasta')).toBe('2026-09-30');
  });

  it('resuelve año y mes por separado, en formato numérico y textual', () => {
    const parametros: ParametroGeneral[] = [
      { nombre: 'anio', fuente: 'Anio' },
      { nombre: 'mesNum', fuente: 'MesNumero' },
      { nombre: 'mesTexto', fuente: 'MesNombre' }
    ];
    const valores = resolverParametrosGenerales(parametros, periodoTrimestral());
    expect(valores.get('anio')).toBe('2026');
    expect(valores.get('mesNum')).toBe('7');
    expect(valores.get('mesTexto')).toBe('Julio');
  });

  it('resuelve la lista de meses cubiertos por un período multi-mes', () => {
    const parametros: ParametroGeneral[] = [
      { nombre: 'meses', fuente: 'MesesNumeroLista' },
      { nombre: 'mesesTexto', fuente: 'MesesNombreLista' }
    ];
    const valores = resolverParametrosGenerales(parametros, periodoTrimestral());
    expect(valores.get('meses')).toBe('7,8,9');
    expect(valores.get('mesesTexto')).toBe('Julio,Agosto,Septiembre');
  });
});

describe('ejemploParaFuente', () => {
  // El período de ejemplo interno es crearPeriodo(2026, Trimestral, 3) — mismos datos que periodoTrimestral() arriba.
  const TODAS_LAS_FUENTES: FuenteParametroGeneral[] = [
    'PeriodoId', 'PeriodoEtiqueta', 'FechaInicio', 'FechaFin', 'Anio', 'MesNumero', 'MesNombre',
    'MesesNumeroLista', 'MesesNombreLista', 'Numero', 'Periodicidad'
  ];

  it('devuelve un valor no vacío y sin "undefined" para cada una de las 11 fuentes', () => {
    for (const fuente of TODAS_LAS_FUENTES) {
      const ejemplo = ejemploParaFuente(fuente);
      expect(ejemplo).not.toBe('');
      expect(ejemplo).not.toContain('undefined');
    }
  });

  it('calcula valores concretos y correctos para el período de ejemplo (2026, T3)', () => {
    expect(ejemploParaFuente('PeriodoId')).toBe('2026-Trimestral-03');
    expect(ejemploParaFuente('Anio')).toBe('2026');
    expect(ejemploParaFuente('Numero')).toBe('3');
    expect(ejemploParaFuente('MesNumero')).toBe('7');
    expect(ejemploParaFuente('MesNombre')).toBe('Julio');
    expect(ejemploParaFuente('Periodicidad')).toBe('Trimestral');
  });
});
