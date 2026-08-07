import { describe, expect, it } from 'vitest';
import { conciliarConLista } from '@domain/services/ConciliacionLista';
import type { ElementoLista } from '@domain/entities/Lista';

/**
 * `codigo` y `nombre` son deliberadamente distintos en estos fixtures (a
 * diferencia de un elemento real donde podrían coincidir por casualidad):
 * un origen automático (SQL/API/XMLA/PowerBI) devuelve nombres legibles
 * ("Masculino"), nunca códigos internos autogenerados desde el prefijo de
 * la lista ("SX-01") — la conciliación debe comparar contra el nombre.
 */
function elemento(codigo: string, nombre: string, activo = true): ElementoLista {
  return { id: codigo, listaId: 'l1', codigo, nombre, descripcion: '', orden: 1, padreCodigo: null, activo };
}

describe('conciliarConLista', () => {
  it('separa los valores del resultado en coincidentes y no encontrados, comparando por NOMBRE', () => {
    const elementos = [elemento('M', 'Masculino'), elemento('F', 'Femenino')];
    const reporte = conciliarConLista(['Masculino', 'Femenino', 'Otro'], elementos);
    expect(reporte.coincidentes).toEqual(['Masculino', 'Femenino']);
    expect(reporte.noEncontrados).toEqual(['Otro']);
  });

  it('un valor que coincide con el CÓDIGO pero no el nombre no se considera coincidente', () => {
    const elementos = [elemento('M', 'Masculino')];
    const reporte = conciliarConLista(['M'], elementos);
    expect(reporte.coincidentes).toEqual([]);
    expect(reporte.noEncontrados).toEqual(['M']);
  });

  it('reporta (por nombre) los elementos activos de la lista sin dato en el resultado', () => {
    const elementos = [elemento('M', 'Masculino'), elemento('F', 'Femenino')];
    const reporte = conciliarConLista(['Masculino'], elementos);
    expect(reporte.sinDatoEnResultado).toEqual(['Femenino']);
  });

  it('ignora elementos inactivos al reportar los que faltan en el resultado', () => {
    const elementos = [elemento('M', 'Masculino'), elemento('F', 'Femenino', false)];
    const reporte = conciliarConLista(['Masculino'], elementos);
    expect(reporte.sinDatoEnResultado).toEqual([]);
  });
});
