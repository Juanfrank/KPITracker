import { describe, expect, it } from 'vitest';
import {
  agregarHijo, atributosReferenciados, condicionVacia, envolverEnGrupo,
  esOperadorLogico, quitarHijo, reemplazarHijo
} from '@domain/rules/constructorCondicion';
import type { Condicion } from '@domain/rules/Condicion';

describe('constructorCondicion (helpers del editor visual)', () => {
  it('condicionVacia produce una comparación editable por defecto', () => {
    const c = condicionVacia();
    expect(c.op).toBe('eq');
    expect(c.args).toHaveLength(2);
  });

  it('esOperadorLogico distingue and/or/not de los operadores de comparación', () => {
    expect(esOperadorLogico('and')).toBe(true);
    expect(esOperadorLogico('or')).toBe(true);
    expect(esOperadorLogico('not')).toBe(true);
    expect(esOperadorLogico('eq')).toBe(false);
    expect(esOperadorLogico('gt')).toBe(false);
  });

  it('envolverEnGrupo anida la condición actual junto a una vacía', () => {
    const original: Condicion = { op: 'eq', args: [{ attr: 'Estado' }, { literal: 'Activo' }] };
    const envuelta = envolverEnGrupo(original, 'and');
    expect(envuelta.op).toBe('and');
    expect(envuelta.args).toHaveLength(2);
    expect(envuelta.args[0]).toEqual(original);
  });

  it('agregarHijo añade una condición vacía a un grupo existente', () => {
    const grupo: Condicion = { op: 'or', args: [{ op: 'eq', args: [{ attr: 'A' }, { literal: 1 }] }] };
    const conNuevo = agregarHijo(grupo);
    expect(conNuevo.args).toHaveLength(2);
  });

  it('quitarHijo elimina el hijo en el índice dado', () => {
    const grupo: Condicion = {
      op: 'and',
      args: [
        { op: 'eq', args: [{ attr: 'A' }, { literal: 1 }] },
        { op: 'eq', args: [{ attr: 'B' }, { literal: 2 }] },
        { op: 'eq', args: [{ attr: 'C' }, { literal: 3 }] }
      ]
    };
    const sinSegundo = quitarHijo(grupo, 1);
    expect(sinSegundo.args).toHaveLength(2);
    expect((sinSegundo.args[0] as Condicion).args[0]).toEqual({ attr: 'A' });
    expect((sinSegundo.args[1] as Condicion).args[0]).toEqual({ attr: 'C' });
  });

  it('reemplazarHijo sustituye el operando en el índice dado sin tocar los demás', () => {
    const c: Condicion = { op: 'gt', args: [{ attr: 'Monto' }, { literal: 100 }] };
    const modificada = reemplazarHijo(c, 1, { literal: 500 });
    expect(modificada.args[0]).toEqual({ attr: 'Monto' });
    expect(modificada.args[1]).toEqual({ literal: 500 });
  });

  it('atributosReferenciados recorre condiciones anidadas y deduplica nombres', () => {
    const c: Condicion = {
      op: 'and',
      args: [
        { op: 'gt', args: [{ attr: 'Monto' }, { literal: 100 }] },
        { op: 'eq', args: [{ attr: 'Estado' }, { attr: 'Monto' }] }
      ]
    };
    expect(atributosReferenciados(c).sort()).toEqual(['Estado', 'Monto']);
  });

  it('atributosReferenciados ignora operandos sin nombre de atributo (literales vacíos)', () => {
    const c: Condicion = { op: 'eq', args: [{ attr: '' }, { literal: '' }] };
    expect(atributosReferenciados(c)).toEqual([]);
  });
});
