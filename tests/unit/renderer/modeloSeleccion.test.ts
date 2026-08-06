import { describe, expect, it } from 'vitest';
import {
  alternarCategoria, alternarItem, aSeleccionIpc, contarSeleccionados, estadoDeCategoria, seleccionInicial,
  seleccionarTodosItems
} from '@renderer/src/modulos/perfiles/modeloSeleccion';
import type { EstadoSeleccion } from '@renderer/src/modulos/perfiles/modeloSeleccion';
import type { CategoriaResumen, ResumenRespaldo } from '@infrastructure/perfiles/esquemaRespaldo';

const listas: CategoriaResumen = {
  categoria: 'listas',
  etiqueta: 'Listas de selección',
  items: [
    { id: 'l1', nombre: 'Sexo' },
    { id: 'l2', nombre: 'Región' },
    { id: 'l3', nombre: 'Edad' }
  ],
  total: 3,
  atomica: false
};

const configuracionGeneral: CategoriaResumen = {
  categoria: 'configuracionGeneral',
  etiqueta: 'Configuración general',
  items: [],
  total: 1,
  atomica: true
};

const resumen: ResumenRespaldo = {
  schemaVersion: 1,
  exportadoEn: '2026-01-01T00:00:00.000Z',
  appVersion: '1.0.0',
  categorias: [configuracionGeneral, listas]
};

describe('modeloSeleccion — seleccionInicial', () => {
  it('arranca con todas las categorías en "todos"', () => {
    const estado = seleccionInicial(resumen);
    expect(estado.configuracionGeneral).toBe('todos');
    expect(estado.listas).toBe('todos');
    expect(estadoDeCategoria(estado, listas)).toBe('todos');
    expect(contarSeleccionados(estado, listas)).toBe(3);
  });
});

describe('modeloSeleccion — transiciones', () => {
  it('desmarcar la categoría completa pasa a "ninguno" (Set vacío)', () => {
    const inicial = seleccionInicial(resumen);
    const siguiente = alternarCategoria(inicial, 'listas', false);
    expect(estadoDeCategoria(siguiente, listas)).toBe('ninguno');
    expect(contarSeleccionados(siguiente, listas)).toBe(0);
    expect(siguiente.listas).toEqual(new Set());
  });

  it('marcar un ítem puntual desde "ninguno" pasa a "parcial"', () => {
    let estado = alternarCategoria(seleccionInicial(resumen), 'listas', false);
    estado = alternarItem(estado, listas, 'l1', true);
    expect(estadoDeCategoria(estado, listas)).toBe('parcial');
    expect(contarSeleccionados(estado, listas)).toBe(1);
  });

  it('desmarcar un ítem puntual desde "todos" pasa a "parcial" (expande el Set implícito)', () => {
    const inicial = seleccionInicial(resumen);
    const estado = alternarItem(inicial, listas, 'l2', false);
    expect(estadoDeCategoria(estado, listas)).toBe('parcial');
    expect(contarSeleccionados(estado, listas)).toBe(2);
    expect(estado.listas).toEqual(new Set(['l1', 'l3']));
  });

  it('marcar todos los ítems uno por uno normaliza a "todos"', () => {
    let estado: EstadoSeleccion = alternarCategoria(seleccionInicial(resumen), 'listas', false);
    estado = alternarItem(estado, listas, 'l1', true);
    estado = alternarItem(estado, listas, 'l2', true);
    estado = alternarItem(estado, listas, 'l3', true);
    expect(estadoDeCategoria(estado, listas)).toBe('todos');
    expect(estado.listas).toBe('todos');
  });

  it('desmarcar el último ítem individual deja la categoría en "ninguno"', () => {
    let estado = alternarCategoria(seleccionInicial(resumen), 'listas', false);
    estado = alternarItem(estado, listas, 'l1', true);
    estado = alternarItem(estado, listas, 'l1', false);
    expect(estadoDeCategoria(estado, listas)).toBe('ninguno');
    expect(contarSeleccionados(estado, listas)).toBe(0);
  });

  it('"Seleccionar todo"/"Deseleccionar todo" del panel expandido equivale a alternarCategoria', () => {
    const desmarcado = seleccionarTodosItems(seleccionInicial(resumen), listas, false);
    expect(estadoDeCategoria(desmarcado, listas)).toBe('ninguno');
    const marcado = seleccionarTodosItems(desmarcado, listas, true);
    expect(estadoDeCategoria(marcado, listas)).toBe('todos');
  });
});

describe('modeloSeleccion — aSeleccionIpc', () => {
  it('serializa "todos" tal cual y los Sets no vacíos como arreglo de ids', () => {
    let estado = seleccionInicial(resumen);
    estado = alternarItem(estado, listas, 'l2', false);
    const seleccion = aSeleccionIpc(estado);
    expect(seleccion.configuracionGeneral).toBe('todos');
    expect(seleccion.listas).toEqual(expect.arrayContaining(['l1', 'l3']));
    expect((seleccion.listas as string[]).length).toBe(2);
  });

  it('omite categorías sin nada seleccionado (fail-closed)', () => {
    let estado = seleccionInicial(resumen);
    estado = alternarCategoria(estado, 'listas', false);
    const seleccion = aSeleccionIpc(estado);
    expect(seleccion.configuracionGeneral).toBe('todos');
    expect('listas' in seleccion).toBe(false);
  });
});
