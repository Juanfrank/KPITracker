import { describe, expect, it } from 'vitest';
import type { ContextoPermisos } from '@domain/index';
import {
  puedeAdministrarCatalogos, puedeAsignarIndicadoresEquipo, puedeGestionarMiembrosEquipo, puedeSobreIndicador,
  puedeVerAuditoriaEquipo, puedeVerAuditoriaTodo, puedeVerIndicador
} from '@domain/index';

function ctx(parcial: Partial<ContextoPermisos> = {}): ContextoPermisos {
  return {
    esAdministrador: false,
    usuarioId: null,
    equipoId: null,
    permisosGenerales: new Set(),
    permisosEquipo: new Set(),
    permisosExcepcionales: new Set(),
    ...parcial
  };
}

const INDICADOR_EQUIPO_A = { equipoEfectivoId: 'equipo-a', responsable: null };

describe('puedeSobreIndicador', () => {
  it('el administrador puede cualquier acción sobre cualquier indicador', () => {
    expect(puedeSobreIndicador(ctx({ esAdministrador: true }), 'ver', INDICADOR_EQUIPO_A)).toBe(true);
    expect(puedeSobreIndicador(ctx({ esAdministrador: true }), 'registrar', INDICADOR_EQUIPO_A)).toBe(true);
    expect(puedeSobreIndicador(ctx({ esAdministrador: true }), 'validar', INDICADOR_EQUIPO_A)).toBe(true);
  });

  it('un permiso general (resultados.<accion>.todos) alcanza sin importar el equipo', () => {
    const contexto = ctx({ permisosGenerales: new Set(['resultados.validar.todos']) });
    expect(puedeSobreIndicador(contexto, 'validar', INDICADOR_EQUIPO_A)).toBe(true);
    expect(puedeSobreIndicador(contexto, 'ver', INDICADOR_EQUIPO_A)).toBe(false);
  });

  it('un permiso excepcional funciona igual que uno general o de equipo', () => {
    const excepcionalGeneral = ctx({ permisosExcepcionales: new Set(['resultados.ver.todos']) });
    expect(puedeSobreIndicador(excepcionalGeneral, 'ver', INDICADOR_EQUIPO_A)).toBe(true);

    const excepcionalEquipo = ctx({ equipoId: 'equipo-a', permisosExcepcionales: new Set(['resultados.registrar.equipo']) });
    expect(puedeSobreIndicador(excepcionalEquipo, 'registrar', INDICADOR_EQUIPO_A)).toBe(true);
    // Sin equipoId coincidente, el permiso excepcional de equipo NO aplica.
    expect(puedeSobreIndicador(ctx({ permisosExcepcionales: new Set(['resultados.registrar.equipo']) }), 'registrar', INDICADOR_EQUIPO_A))
      .toBe(false);
  });

  it('un permiso de equipo solo aplica cuando el equipo del usuario coincide con el equipo efectivo del indicador', () => {
    const contexto = ctx({ equipoId: 'equipo-a', permisosEquipo: new Set(['resultados.ver.equipo']) });
    expect(puedeSobreIndicador(contexto, 'ver', INDICADOR_EQUIPO_A)).toBe(true);
    expect(puedeSobreIndicador(contexto, 'ver', { equipoEfectivoId: 'equipo-b', responsable: null })).toBe(false);
  });

  it('la regla del responsable directo concede ver/registrar SIEMPRE, pero nunca validar', () => {
    const contexto = ctx({ usuarioId: 'resp-1' });
    const indicador = { equipoEfectivoId: null, responsable: 'resp-1' };
    expect(puedeSobreIndicador(contexto, 'ver', indicador)).toBe(true);
    expect(puedeSobreIndicador(contexto, 'registrar', indicador)).toBe(true);
    expect(puedeSobreIndicador(contexto, 'validar', indicador)).toBe(false);
  });

  it('sin ningún permiso ni relación, se rechaza toda acción', () => {
    const contexto = ctx();
    expect(puedeSobreIndicador(contexto, 'ver', INDICADOR_EQUIPO_A)).toBe(false);
    expect(puedeSobreIndicador(contexto, 'registrar', INDICADOR_EQUIPO_A)).toBe(false);
    expect(puedeSobreIndicador(contexto, 'validar', INDICADOR_EQUIPO_A)).toBe(false);
  });
});

describe('puedeVerIndicador', () => {
  it('indicadores.ver.todos y catalogos.administrar dan visibilidad total, más allá de puedeSobreIndicador', () => {
    expect(puedeVerIndicador(ctx({ permisosGenerales: new Set(['indicadores.ver.todos']) }), INDICADOR_EQUIPO_A)).toBe(true);
    expect(puedeVerIndicador(ctx({ permisosGenerales: new Set(['catalogos.administrar']) }), INDICADOR_EQUIPO_A)).toBe(true);
    expect(puedeVerIndicador(ctx(), INDICADOR_EQUIPO_A)).toBe(false);
  });
});

describe('puedeAdministrarCatalogos', () => {
  it('admin o el permiso catalogos.administrar (general o excepcional)', () => {
    expect(puedeAdministrarCatalogos(ctx({ esAdministrador: true }))).toBe(true);
    expect(puedeAdministrarCatalogos(ctx({ permisosGenerales: new Set(['catalogos.administrar']) }))).toBe(true);
    expect(puedeAdministrarCatalogos(ctx({ permisosExcepcionales: new Set(['catalogos.administrar']) }))).toBe(true);
    expect(puedeAdministrarCatalogos(ctx())).toBe(false);
  });
});

describe('auditoría', () => {
  it('puedeVerAuditoriaTodo exige admin o auditoria.ver.todos', () => {
    expect(puedeVerAuditoriaTodo(ctx({ esAdministrador: true }))).toBe(true);
    expect(puedeVerAuditoriaTodo(ctx({ permisosGenerales: new Set(['auditoria.ver.todos']) }))).toBe(true);
    expect(puedeVerAuditoriaTodo(ctx())).toBe(false);
  });

  it('puedeVerAuditoriaEquipo exige que el equipo coincida y el permiso auditoria.ver.equipo', () => {
    const contexto = ctx({ equipoId: 'equipo-a', permisosEquipo: new Set(['auditoria.ver.equipo']) });
    expect(puedeVerAuditoriaEquipo(contexto, 'equipo-a')).toBe(true);
    expect(puedeVerAuditoriaEquipo(contexto, 'equipo-b')).toBe(false);
    expect(puedeVerAuditoriaEquipo(contexto, null)).toBe(false);
  });
});

describe('capacidades de líder de equipo', () => {
  it('puedeGestionarMiembrosEquipo/puedeAsignarIndicadoresEquipo exigen el permiso Y el equipo correcto (o catalogos.administrar)', () => {
    const lider = ctx({ equipoId: 'equipo-a', permisosEquipo: new Set(['equipo.miembros.gestionar', 'equipo.indicadores.asignar']) });
    expect(puedeGestionarMiembrosEquipo(lider, 'equipo-a')).toBe(true);
    expect(puedeGestionarMiembrosEquipo(lider, 'equipo-b')).toBe(false);
    expect(puedeAsignarIndicadoresEquipo(lider, 'equipo-a')).toBe(true);

    const admin = ctx({ esAdministrador: true });
    expect(puedeGestionarMiembrosEquipo(admin, 'cualquier-equipo')).toBe(true);
  });
});
