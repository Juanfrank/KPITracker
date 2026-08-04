import { describe, expect, it } from 'vitest';
import { EvaluadorFormulas, ValidacionError } from '@domain/index';

describe('EvaluadorFormulas', () => {
  const ev = new EvaluadorFormulas();

  it('evalúa una expresión aritmética simple con referencias', () => {
    const valor = ev.evaluar('[IND-001] + [IND-002] * 0.5', new Map([['IND-001', 10], ['IND-002', 4]]));
    expect(valor).toBe(12);
  });

  it('respeta precedencia y paréntesis', () => {
    expect(ev.evaluar('([IND-001] + [IND-002]) * 2', new Map([['IND-001', 3], ['IND-002', 1]]))).toBe(8);
  });

  it('soporta negación unaria', () => {
    expect(ev.evaluar('-[IND-001]', new Map([['IND-001', 5]]))).toBe(-5);
  });

  it('devuelve null si una referencia no tiene valor', () => {
    expect(ev.evaluar('[IND-001] + [IND-002]', new Map([['IND-001', 10], ['IND-002', null]]))).toBeNull();
  });

  it('devuelve null si una referencia no está en el mapa de valores', () => {
    expect(ev.evaluar('[IND-001]', new Map())).toBeNull();
  });

  it('devuelve null en división por cero', () => {
    expect(ev.evaluar('[IND-001] / [IND-002]', new Map([['IND-001', 10], ['IND-002', 0]]))).toBeNull();
  });

  it('extrae los códigos referenciados', () => {
    expect(ev.codigosReferenciados('[A] + [B] * ([C] - [A])')).toEqual(['A', 'B', 'C']);
  });

  it('rechaza sintaxis inválida', () => {
    expect(() => ev.validar('[IND-001] +')).toThrow(ValidacionError);
    expect(() => ev.validar('(1 + 2')).toThrow(ValidacionError);
    expect(() => ev.validar('[]')).toThrow(ValidacionError);
    expect(() => ev.validar('')).toThrow(ValidacionError);
  });

  it('acepta sintaxis válida sin lanzar', () => {
    expect(() => ev.validar('[IND-001] + 1')).not.toThrow();
  });

  it('detecta ciclo directo A -> A', () => {
    expect(ev.formaCiclo('A', '[A] + 1', new Map())).toBe(true);
  });

  it('detecta ciclo indirecto A -> B -> A', () => {
    const formulas = new Map([['B', '[A] * 2']]);
    expect(ev.formaCiclo('A', '[B] + 1', formulas)).toBe(true);
  });

  it('no reporta ciclo cuando las dependencias son acíclicas', () => {
    const formulas = new Map([['B', '[C] * 2']]);
    expect(ev.formaCiclo('A', '[B] + 1', formulas)).toBe(false);
  });
});
