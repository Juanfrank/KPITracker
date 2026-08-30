import { describe, expect, it } from 'vitest';
import { cadenaAncestros, etiquetaConPrefijo, sinCiclo } from '@domain/entities/Catalogos';

describe('etiquetaConPrefijo', () => {
  it('antepone el prefijo cuando ambos están presentes', () => {
    expect(etiquetaConPrefijo('EST', 'IND-001')).toBe('EST-IND-001');
  });

  it('devuelve el código tal cual cuando no hay prefijo', () => {
    expect(etiquetaConPrefijo(null, 'IND-001')).toBe('IND-001');
    expect(etiquetaConPrefijo(undefined, 'IND-001')).toBe('IND-001');
    expect(etiquetaConPrefijo('', 'IND-001')).toBe('IND-001');
  });

  it('devuelve el código tal cual (vacío) cuando no hay código, aunque haya prefijo', () => {
    expect(etiquetaConPrefijo('EST', '')).toBe('');
  });
});

describe('sinCiclo', () => {
  const cat = (id: string, padreId: string | null): { id: string; padreId: string | null } => ({ id, padreId });

  it('acepta padre null (raíz)', () => {
    expect(sinCiclo('a', null, [])).toBe(true);
  });

  it('rechaza que un elemento sea su propio padre', () => {
    expect(sinCiclo('a', 'a', [cat('a', null)])).toBe(false);
  });

  it('acepta un padre válido sin relación circular', () => {
    const todos = [cat('a', null), cat('b', null)];
    expect(sinCiclo('a', 'b', todos)).toBe(true);
  });

  it('rechaza un ciclo directo (b ya es hijo de a, a no puede ser hijo de b)', () => {
    const todos = [cat('a', null), cat('b', 'a')];
    expect(sinCiclo('a', 'b', todos)).toBe(false);
  });

  it('rechaza un ciclo indirecto de 3 niveles (c es nieto de a; a no puede ser hijo de c)', () => {
    const todos = [cat('a', null), cat('b', 'a'), cat('c', 'b')];
    expect(sinCiclo('a', 'c', todos)).toBe(false);
  });

  it('acepta reasignar un elemento a un tío/hermano no relacionado', () => {
    const todos = [cat('a', null), cat('b', 'a'), cat('c', 'a'), cat('d', 'c')];
    expect(sinCiclo('b', 'd', todos)).toBe(true);
  });
});

describe('cadenaAncestros', () => {
  const cat = (id: string, padreId: string | null): { id: string; padreId: string | null } => ({ id, padreId });

  it('una raíz sin padre devuelve solo su propio id', () => {
    expect(cadenaAncestros('a', [cat('a', null)])).toEqual(['a']);
  });

  it('devuelve la cadena completa hasta la raíz, empezando por el propio id', () => {
    const todos = [cat('a', null), cat('b', 'a'), cat('c', 'b')];
    expect(cadenaAncestros('c', todos)).toEqual(['c', 'b', 'a']);
  });

  it('un id ausente del catálogo devuelve solo ese id', () => {
    expect(cadenaAncestros('x', [cat('a', null)])).toEqual(['x']);
  });

  it('corta ante un ciclo preexistente en los datos en vez de colgarse', () => {
    const todos = [cat('a', 'b'), cat('b', 'a')];
    expect(cadenaAncestros('a', todos)).toEqual(['a', 'b']);
  });
});
