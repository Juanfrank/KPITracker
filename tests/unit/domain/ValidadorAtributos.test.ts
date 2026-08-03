import { describe, expect, it } from 'vitest';
import { ValidadorAtributos } from '@domain/rules/ValidadorAtributos';
import { crearRegistroTiposBase } from '@domain/data-types/builtinTypes';
import { TipoDato } from '@domain/value-objects/TipoDato';
import type { Atributo } from '@domain/entities/Atributo';
import type { ContextoEvaluacion } from '@domain/rules/Condicion';
import type { ValorAtributo } from '@domain/data-types/TypeDescriptor';

function atributo(parcial: Partial<Atributo> & { id: string }): Atributo {
  return {
    entidad: 'Indicador',
    nombre: parcial.id,
    descripcion: '',
    grupo: 'General',
    orden: 1,
    visible: true,
    editable: true,
    obligatorio: false,
    valorPorDefecto: null,
    tipoDato: TipoDato.ShortText,
    listaId: null,
    validaciones: [],
    condicionVisibilidad: null,
    condicionObligatorio: null,
    activo: true,
    creadoEn: '2025-01-01T00:00:00Z',
    actualizadoEn: '2025-01-01T00:00:00Z',
    ...parcial
  };
}

function contexto(valores: Record<string, string | number | boolean | null>): ContextoEvaluacion {
  return { obtenerAtributo: (n) => valores[n] ?? null };
}

const validador = new ValidadorAtributos(crearRegistroTiposBase());

describe('ValidadorAtributos', () => {
  it('marca error si un atributo obligatorio está vacío', () => {
    const attrs = [atributo({ id: 'a1', obligatorio: true })];
    const errores = validador.validar(attrs, new Map(), contexto({}));
    expect(errores).toHaveLength(1);
    expect(errores[0]?.errores[0]?.validacion).toBe('Obligatorio');
  });

  it('no valida atributos ocultos por condición de visibilidad', () => {
    const attrs = [
      atributo({
        id: 'a1',
        obligatorio: true,
        condicionVisibilidad: { op: 'eq', args: [{ attr: 'Estado' }, { literal: 'Activo' }] }
      })
    ];
    expect(validador.validar(attrs, new Map(), contexto({ Estado: 'Inactivo' }))).toHaveLength(0);
    expect(validador.validar(attrs, new Map(), contexto({ Estado: 'Activo' }))).toHaveLength(1);
  });

  it('obligatoriedad condicional: obligatorio solo si Monto > 5000', () => {
    const attrs = [
      atributo({
        id: 'justificacion',
        condicionObligatorio: { op: 'gt', args: [{ attr: 'Monto' }, { literal: 5000 }] }
      })
    ];
    expect(validador.validar(attrs, new Map(), contexto({ Monto: 9000 }))).toHaveLength(1);
    expect(validador.validar(attrs, new Map(), contexto({ Monto: 100 }))).toHaveLength(0);
  });

  it('delega validaciones del tipo (longitud, rangos) al TypeRegistry', () => {
    const attrs = [
      atributo({ id: 'codigo', validaciones: [{ tipo: 'LongitudMinima', valor: 5 }] }),
      atributo({ id: 'monto', tipoDato: TipoDato.Decimal, validaciones: [{ tipo: 'ValorMaximo', valor: 100 }] })
    ];
    const valores = new Map<string, ValorAtributo>([
      ['codigo', 'abc'],
      ['monto', 500]
    ]);
    const errores = validador.validar(attrs, valores, contexto({}));
    expect(errores).toHaveLength(2);
  });

  it('valores válidos no producen errores', () => {
    const attrs = [atributo({ id: 'codigo', obligatorio: true, validaciones: [{ tipo: 'LongitudMinima', valor: 3 }] })];
    const valores = new Map<string, ValorAtributo>([['codigo', 'ABC-1']]);
    expect(validador.validar(attrs, valores, contexto({}))).toHaveLength(0);
  });
});
