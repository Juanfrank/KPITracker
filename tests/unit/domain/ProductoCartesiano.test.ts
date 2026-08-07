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

  it('varias desagregaciones producen el CUBO completo: General + subtotal por cada subconjunto + detalle completo', () => {
    const combos = servicio.generar(['sexo', 'provincia', 'tribunal'], elementos);
    // Cada lista aporta un factor de (1 + cantidad de elementos activos): (2+1)×(3+1)×(2+1) = 36.
    expect(combos).toHaveLength(36);
    expect(combos.filter((c) => c.nivel === 0)).toHaveLength(1); // General
    // Subtotales de una sola desagregación (las otras dos enrolladas): 2 + 3 + 2 = 7.
    expect(combos.filter((c) => c.nivel === 1)).toHaveLength(7);
    // Subtotales de dos desagregaciones: (2×3) + (2×2) + (3×2) = 16.
    expect(combos.filter((c) => c.nivel === 2)).toHaveLength(16);
    // Detalle completo (producto cartesiano de las tres, como antes de este cambio): 2×3×2 = 12.
    expect(combos.filter((c) => c.nivel === 3)).toHaveLength(12);
    // El General va primero (nivel ascendente); el resto queda agrupado por nivel.
    expect(claveATexto(combos[0]!.clave)).toBe('GENERAL');
    expect(combos.map((c) => c.nivel)).toEqual([...combos.map((c) => c.nivel)].sort((a, b) => a - b));
  });

  it('un subtotal de una sola desagregación deja las demás ausentes de las etiquetas (enrolladas)', () => {
    const combos = servicio.generar(['sexo', 'provincia'], elementos);
    const subtotalSexo = combos.find((c) => c.nivel === 1 && c.etiquetas[0]?.listaId === 'sexo' && c.etiquetas[0]?.codigo === 'M');
    expect(subtotalSexo).toBeDefined();
    expect(subtotalSexo!.etiquetas).toHaveLength(1); // "provincia" no aparece: está enrollada en este subtotal
    expect(claveATexto(subtotalSexo!.clave)).toBe('sexo=M');
  });

  it('la exclusión temporal remueve la lista del cubo por completo (ni presente ni contribuye a enrollarse)', () => {
    const desagregaciones = ['sexo', 'provincia', 'tribunal'];
    const combos = servicio.generar(desagregaciones, elementos, ['tribunal']);
    // Sin "tribunal": (2+1)×(3+1) = 12.
    expect(combos).toHaveLength(12);
    expect(combos.every((c) => c.etiquetas.every((e) => e.listaId !== 'tribunal'))).toBe(true);
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
