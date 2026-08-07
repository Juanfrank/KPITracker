import { describe, expect, it } from 'vitest';
import { generarCodigoElemento } from '@domain/entities/Lista';

/**
 * Única fuente de verdad para la notación de código autogenerado — la
 * comparten la UI de Listas (alta manual, pegado desde Excel) y la
 * conciliación de orígenes automáticos (alta de elementos que el origen
 * trajo y la lista aún no tenía), para que ambos caminos produzcan códigos
 * consistentes entre sí.
 */
describe('generarCodigoElemento', () => {
  it('con prefijo, arma "<PREFIJO>-<orden con dos dígitos>"', () => {
    expect(generarCodigoElemento('SX', 1)).toBe('SX-01');
    expect(generarCodigoElemento('SX', 12)).toBe('SX-12');
  });

  it('sin prefijo, cae a "E<orden>"', () => {
    expect(generarCodigoElemento('', 3)).toBe('E3');
  });

  it('un orden de tres dígitos no se trunca', () => {
    expect(generarCodigoElemento('SX', 123)).toBe('SX-123');
  });
});
