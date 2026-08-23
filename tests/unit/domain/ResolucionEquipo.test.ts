import { describe, expect, it } from 'vitest';
import { equipoEfectivo } from '@domain/services/ResolucionEquipo';

describe('equipoEfectivo', () => {
  it('devuelve el vínculo directo cuando está presente, sin mirar el responsable', () => {
    const responsablesPorId = new Map([['r1', { equipoId: 'otro-equipo' }]]);
    expect(equipoEfectivo({ equipo: 'equipo-1', responsable: 'r1' }, responsablesPorId)).toBe('equipo-1');
  });

  it('cae al vínculo indirecto vía el responsable cuando no hay vínculo directo', () => {
    const responsablesPorId = new Map([['r1', { equipoId: 'equipo-2' }]]);
    expect(equipoEfectivo({ equipo: null, responsable: 'r1' }, responsablesPorId)).toBe('equipo-2');
  });

  it('devuelve null cuando no hay equipo directo ni responsable con equipo', () => {
    expect(equipoEfectivo({ equipo: null, responsable: null }, new Map())).toBeNull();
    const responsablesPorId = new Map([['r1', { equipoId: null }]]);
    expect(equipoEfectivo({ equipo: null, responsable: 'r1' }, responsablesPorId)).toBeNull();
  });

  it('devuelve null cuando el responsable referenciado no existe en el mapa', () => {
    expect(equipoEfectivo({ equipo: null, responsable: 'inexistente' }, new Map())).toBeNull();
  });
});
