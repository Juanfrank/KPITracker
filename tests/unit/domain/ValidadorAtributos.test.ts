import { describe, expect, it } from 'vitest';
import { ValidadorAtributos } from '@domain/rules/ValidadorAtributos';
import { crearRegistroTiposBase } from '@domain/data-types/builtinTypes';
import { TipoDato } from '@domain/value-objects/TipoDato';
import type { Atributo } from '@domain/entities/Atributo';
import type { ReglaNegocio } from '@domain/entities/ReglaNegocio';
import type { ContextoEvaluacion } from '@domain/rules/Condicion';
import type { ValorAtributo } from '@domain/data-types/TypeDescriptor';

function regla(parcial: Partial<ReglaNegocio> & { condicion: ReglaNegocio['condicion'] }): ReglaNegocio {
  return {
    id: 'r1', nombre: 'Regla', descripcion: '', tipo: 'ValidacionCruzada', entidad: 'Indicador',
    atributoObjetivoId: null, mensajeError: null, activa: true,
    creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-01-01T00:00:00Z',
    ...parcial
  };
}

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

  it('esVisible respeta una ReglaNegocio de tipo Visibilidad dirigida al atributo', () => {
    const attr = atributo({ id: 'a1' });
    const reglaVisibilidad = regla({
      tipo: 'Visibilidad', atributoObjetivoId: 'a1',
      condicion: { op: 'eq', args: [{ attr: 'Estado' }, { literal: 'Activo' }] }
    });
    expect(validador.esVisible(attr, contexto({ Estado: 'Inactivo' }), [reglaVisibilidad])).toBe(false);
    expect(validador.esVisible(attr, contexto({ Estado: 'Activo' }), [reglaVisibilidad])).toBe(true);
  });

  it('esVisible combina con AND la condición propia del atributo y las reglas que lo referencian', () => {
    const attr = atributo({ id: 'a1', condicionVisibilidad: { op: 'notEmpty', args: [{ attr: 'Categoria' }] } });
    const reglaVisibilidad = regla({
      tipo: 'Visibilidad', atributoObjetivoId: 'a1',
      condicion: { op: 'eq', args: [{ attr: 'Estado' }, { literal: 'Activo' }] }
    });
    // Cumple la condición propia pero no la regla externa: debe ocultarse.
    expect(validador.esVisible(attr, contexto({ Categoria: 'X', Estado: 'Inactivo' }), [reglaVisibilidad])).toBe(false);
    expect(validador.esVisible(attr, contexto({ Categoria: 'X', Estado: 'Activo' }), [reglaVisibilidad])).toBe(true);
  });

  it('esVisible ignora reglas de Visibilidad inactivas o dirigidas a otro atributo', () => {
    const attr = atributo({ id: 'a1' });
    const inactiva = regla({ tipo: 'Visibilidad', atributoObjetivoId: 'a1', activa: false, condicion: { op: 'isEmpty', args: [{ attr: 'X' }] } });
    const otroAtributo = regla({ tipo: 'Visibilidad', atributoObjetivoId: 'otro', condicion: { op: 'isEmpty', args: [{ attr: 'X' }] } });
    expect(validador.esVisible(attr, contexto({}), [inactiva, otroAtributo])).toBe(true);
  });

  it('esObligatorio usa una ReglaNegocio de tipo Obligatoriedad cuando el atributo no tiene condición propia', () => {
    const attr = atributo({ id: 'a1' });
    const reglaObligatoriedad = regla({
      tipo: 'Obligatoriedad', atributoObjetivoId: 'a1',
      condicion: { op: 'gt', args: [{ attr: 'Monto' }, { literal: 5000 }] }
    });
    expect(validador.esObligatorio(attr, contexto({ Monto: 9000 }), [reglaObligatoriedad])).toBe(true);
    expect(validador.esObligatorio(attr, contexto({ Monto: 100 }), [reglaObligatoriedad])).toBe(false);
  });

  it('la condicionObligatorio propia del atributo tiene precedencia sobre las reglas del módulo Reglas', () => {
    const attr = atributo({ id: 'a1', condicionObligatorio: { op: 'eq', args: [{ attr: 'X' }, { literal: 'si' }] } });
    const reglaObligatoriedad = regla({ tipo: 'Obligatoriedad', atributoObjetivoId: 'a1', condicion: { op: 'notEmpty', args: [{ attr: 'Y' }] } });
    // Aunque la regla externa se cumpliría, gana la condición propia (que aquí es falsa).
    expect(validador.esObligatorio(attr, contexto({ X: 'no', Y: 'algo' }), [reglaObligatoriedad])).toBe(false);
  });

  it('validar aplica reglas de Visibilidad/Obligatoriedad pasadas explícitamente', () => {
    const attrs = [
      atributo({
        id: 'a1', nombre: 'Justificación'
      })
    ];
    const reglas = [
      regla({ tipo: 'Obligatoriedad', atributoObjetivoId: 'a1', condicion: { op: 'gt', args: [{ attr: 'Monto' }, { literal: 5000 }] } })
    ];
    expect(validador.validar(attrs, new Map(), contexto({ Monto: 9000 }), reglas)).toHaveLength(1);
    expect(validador.validar(attrs, new Map(), contexto({ Monto: 100 }), reglas)).toHaveLength(0);
  });

  it('validarCruzadas retorna los mensajes de las reglas ValidacionCruzada incumplidas de la entidad dada', () => {
    const reglas = [
      regla({
        nombre: 'Fechas', entidad: 'Indicador', mensajeError: 'FechaFinal debe ser mayor que FechaInicio.',
        condicion: { op: 'gt', args: [{ attr: 'FechaFinal' }, { attr: 'FechaInicio' }] }
      }),
      regla({ nombre: 'Otra', entidad: 'Recoleccion', condicion: { op: 'gt', args: [{ attr: 'General' }, { literal: 0 }] } })
    ];
    const incumplidas = validador.validarCruzadas(
      reglas, 'Indicador', contexto({ FechaInicio: '2025-06-01', FechaFinal: '2025-01-01' })
    );
    expect(incumplidas).toEqual(['FechaFinal debe ser mayor que FechaInicio.']);
  });

  it('validarCruzadas no reporta nada cuando todas las reglas se cumplen', () => {
    const reglas = [regla({ condicion: { op: 'gt', args: [{ attr: 'FechaFinal' }, { attr: 'FechaInicio' }] } })];
    expect(validador.validarCruzadas(reglas, 'Indicador', contexto({ FechaInicio: '2025-01-01', FechaFinal: '2025-06-01' }))).toHaveLength(0);
  });
});
