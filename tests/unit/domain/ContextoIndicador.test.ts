import { describe, expect, it } from 'vitest';
import { construirContextoIndicador } from '@domain/rules/contextoIndicador';
import { Periodicidad } from '@domain/value-objects/Periodicidad';
import { TipoDato } from '@domain/value-objects/TipoDato';
import type { Atributo } from '@domain/entities/Atributo';
import type { Indicador } from '@domain/entities/Indicador';
import type { ValorAtributo } from '@domain/data-types/TypeDescriptor';

function indicador(parcial: Partial<Indicador> = {}): Indicador {
  return {
    id: 'i1', codigo: 'IND-1', nombre: 'Tasa de resolución', definicion: 'def', formaCalculo: null, periodicidad: Periodicidad.Trimestral,
    periodicidadPersonalizadaId: null, lineaBase: 60, lineaBasePeriodoId: null, metaGlobal: 90, desagregaciones: [],
    estado: 'Activo', responsable: 'resp-1', categoria: 'cat-1', equipo: null, unidadMedida: '%', esCalculado: false, formula: null,
    creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-01-01T00:00:00Z',
    ...parcial
  };
}

function atributo(id: string, nombre: string): Atributo {
  return {
    id, entidad: 'Indicador', nombre, descripcion: '', grupo: 'General', orden: 1,
    visible: true, editable: true, obligatorio: false, valorPorDefecto: null,
    tipoDato: TipoDato.ShortText, listaId: null, validaciones: [],
    condicionVisibilidad: null, condicionObligatorio: null, filtrable: false, activo: true, eliminado: false,
    creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-01-01T00:00:00Z'
  };
}

describe('construirContextoIndicador', () => {
  it('resuelve los campos fijos del indicador por nombre', () => {
    const contexto = construirContextoIndicador(indicador(), [], new Map());
    expect(contexto.obtenerAtributo('Nombre')).toBe('Tasa de resolución');
    expect(contexto.obtenerAtributo('Estado')).toBe('Activo');
    expect(contexto.obtenerAtributo('LineaBase')).toBe(60);
    expect(contexto.obtenerAtributo('MetaGlobal')).toBe(90);
    expect(contexto.obtenerAtributo('Periodicidad')).toBe(Periodicidad.Trimestral);
    expect(contexto.obtenerAtributo('UnidadMedida')).toBe('%');
    expect(contexto.obtenerAtributo('Responsable')).toBe('resp-1');
    expect(contexto.obtenerAtributo('Categoria')).toBe('cat-1');
  });

  it('resuelve atributos dinámicos por su nombre, usando el mapa de valores', () => {
    const atributos = [atributo('a1', 'Prioridad')];
    const valores = new Map<string, ValorAtributo>([['a1', 'Alta']]);
    const contexto = construirContextoIndicador(indicador(), atributos, valores);
    expect(contexto.obtenerAtributo('Prioridad')).toBe('Alta');
  });

  it('retorna null para un valor de atributo ausente en el mapa', () => {
    const atributos = [atributo('a1', 'Prioridad')];
    const contexto = construirContextoIndicador(indicador(), atributos, new Map());
    expect(contexto.obtenerAtributo('Prioridad')).toBeNull();
  });

  it('un atributo dinámico con MultiSelectionList se expone como texto unido con "; "', () => {
    const atributos = [atributo('a1', 'Etiquetas')];
    const valores = new Map<string, ValorAtributo>([['a1', ['Urgente', 'Revisado']]]);
    const contexto = construirContextoIndicador(indicador(), atributos, valores);
    expect(contexto.obtenerAtributo('Etiquetas')).toBe('Urgente; Revisado');
  });

  it('retorna null para un nombre que no corresponde a ningún campo fijo ni atributo', () => {
    const contexto = construirContextoIndicador(indicador(), [], new Map());
    expect(contexto.obtenerAtributo('CampoInexistente')).toBeNull();
  });

  it('prioriza un atributo dinámico si su nombre coincide con un campo fijo', () => {
    // Un atributo dinámico llamado igual que un campo fijo (caso de borde) debe primar,
    // porque los atributos se resuelven antes que los campos fijos.
    const atributos = [atributo('a1', 'Estado')];
    const valores = new Map<string, ValorAtributo>([['a1', 'Personalizado']]);
    const contexto = construirContextoIndicador(indicador({ estado: 'Activo' }), atributos, valores);
    expect(contexto.obtenerAtributo('Estado')).toBe('Personalizado');
  });
});
