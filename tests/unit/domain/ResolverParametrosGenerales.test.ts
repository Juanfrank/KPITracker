import { describe, expect, it } from 'vitest';
import { resolverParametrosGenerales } from '@domain/services/ResolverParametrosGenerales';
import type { ParametroGeneral } from '@domain/entities/OrigenAutomatico';
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
