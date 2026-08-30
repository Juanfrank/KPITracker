import { describe, expect, it } from 'vitest';
import {
  ID_ROL_ADMINISTRADOR, ID_ROL_COLABORADOR, ID_ROL_LIDER_EQUIPO, ID_ROL_TECNICO, ID_ROL_USUARIO_ESTANDAR,
  ID_ROL_VALIDADOR, ID_ROL_VISOR, compararRoles
} from '@domain/index';
import type { Rol } from '@domain/index';

const ahora = '2026-01-01T00:00:00.000Z';

function rol(id: string, nombre: string, ambito: Rol['ambito'] = 'equipo'): Rol {
  return {
    id, nombre, ambito, permisos: [], esSistema: id !== 'custom', workspaceId: 'workspace-default',
    creadoEn: ahora, actualizadoEn: ahora
  };
}

describe('compararRoles — orden de visualización (Batch Y)', () => {
  it('ordena los roles de equipo semilla: Líder, Validador, Colaborador, Visor — pedido explícito del usuario', () => {
    const desordenados = [
      rol(ID_ROL_VISOR, 'Visor'),
      rol(ID_ROL_COLABORADOR, 'Colaborador'),
      rol(ID_ROL_VALIDADOR, 'Validador'),
      rol(ID_ROL_LIDER_EQUIPO, 'Líder de equipo')
    ];
    const ordenados = [...desordenados].sort(compararRoles);
    expect(ordenados.map((r) => r.nombre)).toEqual(['Líder de equipo', 'Validador', 'Colaborador', 'Visor']);
  });

  it('ordena los roles generales semilla: Administrador primero', () => {
    const desordenados = [
      rol(ID_ROL_TECNICO, 'Técnico', 'general'),
      rol(ID_ROL_USUARIO_ESTANDAR, 'Usuario estándar', 'general'),
      rol(ID_ROL_ADMINISTRADOR, 'Administrador', 'general')
    ];
    const ordenados = [...desordenados].sort(compararRoles);
    expect(ordenados.map((r) => r.nombre)).toEqual(['Administrador', 'Usuario estándar', 'Técnico']);
  });

  it('un rol personalizado (no semilla) se ordena después de los semilla, alfabéticamente entre ellos', () => {
    const desordenados = [
      rol(ID_ROL_VISOR, 'Visor'),
      { ...rol('custom-zeta', 'Zeta'), esSistema: false },
      rol(ID_ROL_LIDER_EQUIPO, 'Líder de equipo'),
      { ...rol('custom-alfa', 'Alfa'), esSistema: false }
    ];
    const ordenados = [...desordenados].sort(compararRoles);
    expect(ordenados.map((r) => r.nombre)).toEqual(['Líder de equipo', 'Visor', 'Alfa', 'Zeta']);
  });
});
