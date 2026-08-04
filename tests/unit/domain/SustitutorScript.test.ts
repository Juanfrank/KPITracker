import { describe, expect, it } from 'vitest';
import { sustituirTokens, tokensReferenciados } from '@domain/services/SustitutorScript';

describe('sustituirTokens', () => {
  it('reemplaza tokens conocidos por su valor', () => {
    const resultado = sustituirTokens('SELECT * FROM t WHERE anio = {anio} AND mes = {mes}', new Map([['anio', '2026'], ['mes', '7']]));
    expect(resultado).toBe('SELECT * FROM t WHERE anio = 2026 AND mes = 7');
  });

  it('deja intactos los tokens sin valor conocido', () => {
    const resultado = sustituirTokens('WHERE x = {desconocido}', new Map());
    expect(resultado).toBe('WHERE x = {desconocido}');
  });

  it('sustituye repeticiones del mismo token', () => {
    const resultado = sustituirTokens('{a} - {a}', new Map([['a', 'X']]));
    expect(resultado).toBe('X - X');
  });
});

describe('tokensReferenciados', () => {
  it('lista los nombres de token únicos presentes en el script', () => {
    expect(tokensReferenciados('{a} + {b} + {a}')).toEqual(['a', 'b']);
  });

  it('retorna arreglo vacío si no hay tokens', () => {
    expect(tokensReferenciados('SELECT 1')).toEqual([]);
  });
});
