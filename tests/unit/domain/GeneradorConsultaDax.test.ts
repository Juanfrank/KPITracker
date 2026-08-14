import { describe, expect, it } from 'vitest';
import { generarConsultaDax, normalizarReferenciaDax } from '@domain/services/GeneradorConsultaDax';

describe('normalizarReferenciaDax', () => {
  it('acepta una referencia sin comillas y agrega comillas a la tabla', () => {
    expect(normalizarReferenciaDax('Sexo[Nombre]')).toEqual({ tabla: 'Sexo', columna: 'Nombre', calificada: "'Sexo'[Nombre]" });
  });

  it('acepta una referencia ya con comillas simples en la tabla', () => {
    expect(normalizarReferenciaDax("'Sexo Cubo'[Nombre]")).toEqual({
      tabla: 'Sexo Cubo', columna: 'Nombre', calificada: "'Sexo Cubo'[Nombre]"
    });
  });

  it('recorta espacios sobrantes', () => {
    expect(normalizarReferenciaDax('  Provincia [ Nombre ] ')).toEqual({
      tabla: 'Provincia', columna: 'Nombre', calificada: "'Provincia'[Nombre]"
    });
  });

  it('rechaza un formato que no es Tabla[Columna]', () => {
    expect(() => normalizarReferenciaDax('Sexo.Nombre')).toThrow(/Referencia DAX inválida/);
    expect(() => normalizarReferenciaDax('')).toThrow(/Referencia DAX inválida/);
    expect(() => normalizarReferenciaDax('[SoloColumna]')).toThrow(/Referencia DAX inválida/);
  });
});

describe('generarConsultaDax', () => {
  const base = {
    tablaFecha: 'Fecha',
    columnaFecha: 'Fecha',
    fechaInicio: '2026-04-01',
    fechaFin: '2026-06-30',
    medida: 'Total de casos'
  };

  it('genera SUMMARIZECOLUMNS con ROLLUPADDISSUBTOTAL para una desagregación', () => {
    const resultado = generarConsultaDax({
      ...base,
      desagregaciones: [{ listaId: 'sexo-id', referenciaDax: 'Sexo[Nombre]' }]
    });

    expect(resultado.script).toBe(
      [
        'EVALUATE',
        'SUMMARIZECOLUMNS(',
        "  ROLLUPADDISSUBTOTAL('Sexo'[Nombre], \"EsSubtotal1\"),",
        "  FILTER('Fecha', 'Fecha'[Fecha] >= DATE(2026, 4, 1) && 'Fecha'[Fecha] <= DATE(2026, 6, 30)),",
        '  "Total", [Total de casos]',
        ')'
      ].join('\n')
    );
    expect(resultado.columnaValor).toBe('[Total]');
    expect(resultado.mapeoColumnas).toEqual([
      { columna: 'Sexo[Nombre]', listaId: 'sexo-id', columnaSegmentadorSubtotal: '[EsSubtotal1]' }
    ]);
  });

  it('encadena varias desagregaciones dentro de ROLLUPADDISSUBTOTAL, con nombres de segmentador posicionales', () => {
    const resultado = generarConsultaDax({
      ...base,
      desagregaciones: [
        { listaId: 'sexo-id', referenciaDax: 'Sexo[Nombre]' },
        { listaId: 'provincia-id', referenciaDax: "'Provincia Cubo'[Nombre]" }
      ]
    });

    expect(resultado.script).toContain(
      "ROLLUPADDISSUBTOTAL('Sexo'[Nombre], \"EsSubtotal1\", 'Provincia Cubo'[Nombre], \"EsSubtotal2\")"
    );
    expect(resultado.mapeoColumnas).toEqual([
      { columna: 'Sexo[Nombre]', listaId: 'sexo-id', columnaSegmentadorSubtotal: '[EsSubtotal1]' },
      { columna: 'Provincia Cubo[Nombre]', listaId: 'provincia-id', columnaSegmentadorSubtotal: '[EsSubtotal2]' }
    ]);
  });

  it('acepta la medida con o sin corchetes indistintamente', () => {
    const conCorchetes = generarConsultaDax({
      ...base, medida: '[Total de casos]', desagregaciones: [{ listaId: 'a', referenciaDax: 'A[B]' }]
    });
    const sinCorchetes = generarConsultaDax({
      ...base, medida: 'Total de casos', desagregaciones: [{ listaId: 'a', referenciaDax: 'A[B]' }]
    });
    expect(conCorchetes.script).toBe(sinCorchetes.script);
    expect(conCorchetes.script).toContain('"Total", [Total de casos]');
  });

  it('rechaza sin desagregaciones', () => {
    expect(() => generarConsultaDax({ ...base, desagregaciones: [] })).toThrow(/al menos una desagregación/);
  });

  it('rechaza sin tabla/columna de fecha', () => {
    expect(() =>
      generarConsultaDax({ ...base, tablaFecha: '', desagregaciones: [{ listaId: 'a', referenciaDax: 'A[B]' }] })
    ).toThrow(/tabla y la columna de fecha/);
    expect(() =>
      generarConsultaDax({ ...base, columnaFecha: '  ', desagregaciones: [{ listaId: 'a', referenciaDax: 'A[B]' }] })
    ).toThrow(/tabla y la columna de fecha/);
  });

  it('rechaza sin nombre de medida', () => {
    expect(() =>
      generarConsultaDax({ ...base, medida: '  ', desagregaciones: [{ listaId: 'a', referenciaDax: 'A[B]' }] })
    ).toThrow(/nombre de la medida/);
  });

  it('rechaza una referencia de desagregación con formato inválido', () => {
    expect(() =>
      generarConsultaDax({ ...base, desagregaciones: [{ listaId: 'a', referenciaDax: 'A.B' }] })
    ).toThrow(/Referencia DAX inválida/);
  });

  it('formatea fechas de un solo dígito sin ceros a la izquierda', () => {
    const resultado = generarConsultaDax({
      ...base, fechaInicio: '2026-01-05', fechaFin: '2026-01-09',
      desagregaciones: [{ listaId: 'a', referenciaDax: 'A[B]' }]
    });
    expect(resultado.script).toContain('DATE(2026, 1, 5)');
    expect(resultado.script).toContain('DATE(2026, 1, 9)');
  });
});
