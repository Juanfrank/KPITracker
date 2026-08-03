import { describe, expect, it } from 'vitest';
import { crearRegistroTiposBase } from '@domain/data-types/builtinTypes';
import { TipoDato } from '@domain/value-objects/TipoDato';

const tipos = crearRegistroTiposBase();

describe('TypeRegistry y tipos base', () => {
  it('registra los 19 tipos de la especificación', () => {
    expect(tipos.listar()).toHaveLength(19);
    for (const t of Object.values(TipoDato)) expect(tipos.existe(t)).toBe(true);
  });

  it('parsea enteros con límites por tipo', () => {
    expect(tipos.obtener(TipoDato.Int16).parse('1000').valor).toBe(1000);
    expect(tipos.obtener(TipoDato.Int16).parse('40000').ok).toBe(false);
    expect(tipos.obtener(TipoDato.Int32).parse('40000').valor).toBe(40000);
    expect(tipos.obtener(TipoDato.Int32).parse('3.5').ok).toBe(false);
  });

  it('parsea decimales, porcentajes y moneda con símbolos', () => {
    expect(tipos.obtener(TipoDato.Decimal).parse('1,234.56').valor).toBeCloseTo(1234.56);
    expect(tipos.obtener(TipoDato.Percentage).parse('85.5%').valor).toBeCloseTo(85.5);
    expect(tipos.obtener(TipoDato.Currency).parse('$ 1500').valor).toBe(1500);
  });

  it('parsea booleanos en español', () => {
    const b = tipos.obtener(TipoDato.Boolean);
    expect(b.parse('Sí').valor).toBe(true);
    expect(b.parse('no').valor).toBe(false);
    expect(b.parse('tal vez').ok).toBe(false);
    expect(b.format(true)).toBe('Sí');
  });

  it('valida fechas, horas y duraciones', () => {
    expect(tipos.obtener(TipoDato.Date).parse('2025-03-15').ok).toBe(true);
    expect(tipos.obtener(TipoDato.Date).parse('15/03/2025').ok).toBe(false);
    expect(tipos.obtener(TipoDato.Time).parse('14:30').ok).toBe(true);
    expect(tipos.obtener(TipoDato.Duration).parse('01:30').valor).toBe(90);
    expect(tipos.obtener(TipoDato.Duration).format(90)).toBe('1:30');
  });

  it('valida email, url y teléfono', () => {
    expect(tipos.obtener(TipoDato.Email).parse('a@b.com').ok).toBe(true);
    expect(tipos.obtener(TipoDato.Email).parse('no-es-email').ok).toBe(false);
    expect(tipos.obtener(TipoDato.URL).parse('https://ejemplo.do').ok).toBe(true);
    expect(tipos.obtener(TipoDato.URL).parse('ftp://x').ok).toBe(false);
    expect(tipos.obtener(TipoDato.Phone).parse('+1 809-555-1234').ok).toBe(true);
  });

  it('multiselección parsea listas separadas por punto y coma', () => {
    const ms = tipos.obtener(TipoDato.MultiSelectionList);
    expect(ms.parse('A; B; C').valor).toEqual(['A', 'B', 'C']);
    expect(ms.format(['A', 'B'])).toBe('A; B');
  });

  it('aplica validaciones declarativas por tipo', () => {
    const texto = tipos.obtener(TipoDato.ShortText);
    expect(texto.validar('ab', [{ tipo: 'LongitudMinima', valor: 3 }])).toHaveLength(1);
    const numero = tipos.obtener(TipoDato.Int32);
    expect(numero.validar(5, [{ tipo: 'ValorMinimo', valor: 10 }])).toHaveLength(1);
    expect(numero.validar(15, [{ tipo: 'ValorMinimo', valor: 10 }, { tipo: 'ValorMaximo', valor: 20 }])).toHaveLength(0);
    const fecha = tipos.obtener(TipoDato.Date);
    expect(fecha.validar('2025-01-01', [{ tipo: 'FechaMinima', valor: '2025-06-01' }])).toHaveLength(1);
  });

  it('el registro rechaza duplicados y tipos desconocidos', () => {
    expect(() => tipos.obtener('Inexistente')).toThrow(/no registrado/);
  });
});
