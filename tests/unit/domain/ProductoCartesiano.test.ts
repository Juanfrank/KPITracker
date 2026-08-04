import { describe, expect, it } from 'vitest';
import { ProductoCartesiano } from '@domain/services/ProductoCartesiano';
import type { ElementoLista } from '@domain/entities/Lista';
import { claveATexto } from '@domain/value-objects/ClaveDesagregacion';

function elemento(listaId: string, codigo: string, orden: number, activo = true): ElementoLista {
  return { id: `${listaId}-${codigo}`, listaId, codigo, nombre: codigo, descripcion: '', orden, padreCodigo: null, activo };
}

const servicio = new ProductoCartesiano();

const elementos = new Map<string, ElementoLista[]>([
  ['sexo', [elemento('sexo', 'M', 1), elemento('sexo', 'F', 2)]],
  ['provincia', [elemento('provincia', 'SD', 1), elemento('provincia', 'STG', 2), elemento('provincia', 'LV', 3)]],
  ['tribunal', [elemento('tribunal', 'T1', 1), elemento('tribunal', 'T2', 2)]]
]);

describe('ProductoCartesiano', () => {
  it('sin desagregaciones produce solo la fila General', () => {
    const combos = servicio.generar([], elementos);
    expect(combos).toHaveLength(1);
    expect(claveATexto(combos[0]!.clave)).toBe('GENERAL');
  });

  it('una desagregación produce General + un combo por elemento activo', () => {
    const combos = servicio.generar(['sexo'], elementos);
    expect(combos).toHaveLength(3);
    expect(claveATexto(combos[1]!.clave)).toBe('sexo=M');
  });

  it('varias desagregaciones producen el producto cartesiano completo + General', () => {
    const combos = servicio.generar(['sexo', 'provincia', 'tribunal'], elementos);
    // 2 × 3 × 2 = 12 + fila General
    expect(combos).toHaveLength(13);
  });

  it('la exclusión temporal remueve la lista sin alterar la configuración', () => {
    const desagregaciones = ['sexo', 'provincia', 'tribunal'];
    const combos = servicio.generar(desagregaciones, elementos, ['tribunal']);
    // 2 × 3 = 6 + General
    expect(combos).toHaveLength(7);
    expect(desagregaciones).toEqual(['sexo', 'provincia', 'tribunal']);
  });

  it('ignora elementos inactivos', () => {
    const conInactivo = new Map(elementos);
    conInactivo.set('sexo', [elemento('sexo', 'M', 1), elemento('sexo', 'F', 2, false)]);
    const combos = servicio.generar(['sexo'], conInactivo);
    expect(combos).toHaveLength(2);
  });

  it('la clave es canónica (ordenada por listaId) sin importar el orden de selección', () => {
    const a = servicio.generar(['tribunal', 'sexo'], elementos);
    const primera = a.find((c) => claveATexto(c.clave) !== 'GENERAL');
    expect(claveATexto(primera!.clave).startsWith('sexo=')).toBe(true);
  });
});
