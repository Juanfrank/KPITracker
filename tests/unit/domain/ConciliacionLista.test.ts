import { describe, expect, it } from 'vitest';
import { conciliarConLista } from '@domain/services/ConciliacionLista';
import type { ElementoLista } from '@domain/entities/Lista';

function elemento(codigo: string, activo = true): ElementoLista {
  return { id: codigo, listaId: 'l1', codigo, nombre: codigo, descripcion: '', orden: 1, padreCodigo: null, activo };
}

describe('conciliarConLista', () => {
  it('separa los valores del resultado en coincidentes y no encontrados', () => {
    const elementos = [elemento('M'), elemento('F')];
    const reporte = conciliarConLista(['M', 'F', 'X'], elementos);
    expect(reporte.coincidentes).toEqual(['M', 'F']);
    expect(reporte.noEncontrados).toEqual(['X']);
  });

  it('reporta elementos activos de la lista sin dato en el resultado', () => {
    const elementos = [elemento('M'), elemento('F')];
    const reporte = conciliarConLista(['M'], elementos);
    expect(reporte.sinDatoEnResultado).toEqual(['F']);
  });

  it('ignora elementos inactivos al reportar los que faltan en el resultado', () => {
    const elementos = [elemento('M'), elemento('F', false)];
    const reporte = conciliarConLista(['M'], elementos);
    expect(reporte.sinDatoEnResultado).toEqual([]);
  });
});
