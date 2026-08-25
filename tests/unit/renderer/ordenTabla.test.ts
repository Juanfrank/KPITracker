import { describe, expect, it } from 'vitest';
import { ORDEN_POR_DEFECTO, alternarOrden, ordenarFilas } from '@renderer/src/utils/ordenTabla';

interface Fila {
  nombre: string;
  valor: number | null;
}

const filas: Fila[] = [
  { nombre: 'Beta', valor: 20 },
  { nombre: 'Alfa', valor: null },
  { nombre: 'Gamma', valor: 10 }
];

const valorDe = {
  nombre: (f: Fila) => f.nombre,
  valor: (f: Fila) => f.valor
};

describe('alternarOrden', () => {
  it('un clic en una columna nueva empieza en ascendente', () => {
    expect(alternarOrden(ORDEN_POR_DEFECTO, 'nombre')).toEqual({ columna: 'nombre', direccion: 'asc' });
  });

  it('un segundo clic en la misma columna pasa a descendente', () => {
    expect(alternarOrden({ columna: 'nombre', direccion: 'asc' }, 'nombre')).toEqual({ columna: 'nombre', direccion: 'desc' });
  });

  it('un tercer clic vuelve al orden por defecto', () => {
    expect(alternarOrden({ columna: 'nombre', direccion: 'desc' }, 'nombre')).toEqual(ORDEN_POR_DEFECTO);
  });

  it('clickear una columna distinta reinicia el ciclo en ascendente, sin importar el estado anterior', () => {
    expect(alternarOrden({ columna: 'nombre', direccion: 'desc' }, 'valor')).toEqual({ columna: 'valor', direccion: 'asc' });
  });
});

describe('ordenarFilas', () => {
  it('orden por defecto (sin columna) deja las filas tal cual venían', () => {
    expect(ordenarFilas(filas, ORDEN_POR_DEFECTO, valorDe).map((f) => f.nombre)).toEqual(['Beta', 'Alfa', 'Gamma']);
  });

  it('ascendente por texto', () => {
    expect(ordenarFilas(filas, { columna: 'nombre', direccion: 'asc' }, valorDe).map((f) => f.nombre)).toEqual([
      'Alfa', 'Beta', 'Gamma'
    ]);
  });

  it('descendente por texto', () => {
    expect(ordenarFilas(filas, { columna: 'nombre', direccion: 'desc' }, valorDe).map((f) => f.nombre)).toEqual([
      'Gamma', 'Beta', 'Alfa'
    ]);
  });

  it('numérico, y null siempre al final sin importar la dirección', () => {
    expect(ordenarFilas(filas, { columna: 'valor', direccion: 'asc' }, valorDe).map((f) => f.nombre)).toEqual([
      'Gamma', 'Beta', 'Alfa'
    ]);
    expect(ordenarFilas(filas, { columna: 'valor', direccion: 'desc' }, valorDe).map((f) => f.nombre)).toEqual([
      'Beta', 'Gamma', 'Alfa'
    ]);
  });

  it('no muta el arreglo original', () => {
    const copia = [...filas];
    ordenarFilas(filas, { columna: 'nombre', direccion: 'asc' }, valorDe);
    expect(filas).toEqual(copia);
  });

  it('una columna sin extractor registrado deja las filas sin cambios', () => {
    expect(ordenarFilas(filas, { columna: 'inexistente', direccion: 'asc' }, valorDe).map((f) => f.nombre)).toEqual([
      'Beta', 'Alfa', 'Gamma'
    ]);
  });
});
