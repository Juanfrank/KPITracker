import { describe, expect, it } from 'vitest';
import type { ContextoPermisos } from '@domain/index';
import {
  puedeAdministrarCatalogos, puedeAdministrarCategorias, puedeAdministrarEquipos, puedeAdministrarOrigenes,
  puedeAdministrarRoles, puedeAsignarIndicadoresEquipo, puedeGestionarMiembrosEquipo, puedeImportarExportarRespaldo,
  puedeModificarAtributos, puedeModificarIndicadores, puedeModificarListas, puedeModificarMetas, puedeModificarReglas,
  puedeSobreIndicador, puedeVerAuditoriaEquipo, puedeVerAuditoriaTodo, puedeVerIndicador
} from '@domain/index';

function ctx(parcial: Partial<ContextoPermisos> = {}): ContextoPermisos {
  return {
    esAdministrador: false,
    usuarioId: null,
    equipoId: null,
    permisosGenerales: new Set(),
    permisosEquipo: new Set(),
    permisosExcepcionales: new Set(),
    permisosGlobales: new Set(),
    permisosPorCategoria: new Map(),
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

  it('un permiso de categoría (RBAC granular) alcanza sobre CUALQUIER id de categoriasEfectivas (herencia de subcategoría)', () => {
    const contexto = ctx({ permisosPorCategoria: new Map([['cat-salud', new Set(['resultados.validar.categoria'])]]) });
    const indicadorEnSubcategoria = { equipoEfectivoId: null, responsable: null, categoriasEfectivas: ['cat-salud-sub', 'cat-salud'] };
    expect(puedeSobreIndicador(contexto, 'validar', indicadorEnSubcategoria)).toBe(true);
    // Sin la categoría en la cadena, no aplica.
    expect(puedeSobreIndicador(contexto, 'validar', { equipoEfectivoId: null, responsable: null, categoriasEfectivas: ['cat-educacion'] }))
      .toBe(false);
    // El permiso de categoría es específico de la ACCIÓN — 'ver' no queda cubierto por un permiso de 'validar'.
    expect(puedeSobreIndicador(contexto, 'ver', indicadorEnSubcategoria)).toBe(false);
  });

  it('sin categoriasEfectivas (parámetro omitido), el chequeo de categoría simplemente no aplica — no revienta', () => {
    const contexto = ctx({ permisosPorCategoria: new Map([['cat-salud', new Set(['resultados.ver.categoria'])]]) });
    expect(puedeSobreIndicador(contexto, 'ver', INDICADOR_EQUIPO_A)).toBe(false);
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

describe('permisos "Modificar X" (Batch X, X6) — indicadores/metas/atributos/listas/reglas', () => {
  it.each([
    ['indicadores.modificar', puedeModificarIndicadores],
    ['metas.modificar', puedeModificarMetas],
    ['atributos.modificar', puedeModificarAtributos],
    ['listas.modificar', puedeModificarListas],
    ['reglas.modificar', puedeModificarReglas]
  ] as const)('%s: admin, catalogos.administrar, o el permiso de equipo/excepcional puntual — nunca sin nada de eso', (permiso, fn) => {
    expect(fn(ctx({ esAdministrador: true }))).toBe(true);
    expect(fn(ctx({ permisosGenerales: new Set(['catalogos.administrar']) }))).toBe(true);
    expect(fn(ctx({ permisosEquipo: new Set([permiso]) }))).toBe(true);
    expect(fn(ctx({ permisosExcepcionales: new Set([permiso]) }))).toBe(true);
    expect(fn(ctx())).toBe(false);
  });
});

describe('permisos "Administrar X" (Batch X, X7) — categorías/equipos/orígenes/respaldo', () => {
  it.each([
    ['categorias.administrar', puedeAdministrarCategorias],
    ['equipos.administrar', puedeAdministrarEquipos],
    ['origenes.administrar', puedeAdministrarOrigenes],
    ['respaldo.importarExportar', puedeImportarExportarRespaldo]
  ] as const)('%s: admin, catalogos.administrar, o el permiso general/excepcional puntual', (permiso, fn) => {
    expect(fn(ctx({ esAdministrador: true }))).toBe(true);
    expect(fn(ctx({ permisosGenerales: new Set(['catalogos.administrar']) }))).toBe(true);
    expect(fn(ctx({ permisosGenerales: new Set([permiso]) }))).toBe(true);
    expect(fn(ctx({ permisosExcepcionales: new Set([permiso]) }))).toBe(true);
    expect(fn(ctx())).toBe(false);
  });
});

describe('puedeAdministrarRoles (Batch X, X7)', () => {
  it('exige admin o el permiso puntual roles.administrar — catalogos.administrar NO alcanza (deliberado)', () => {
    expect(puedeAdministrarRoles(ctx({ esAdministrador: true }))).toBe(true);
    expect(puedeAdministrarRoles(ctx({ permisosGenerales: new Set(['roles.administrar']) }))).toBe(true);
    expect(puedeAdministrarRoles(ctx({ permisosExcepcionales: new Set(['roles.administrar']) }))).toBe(true);
    expect(puedeAdministrarRoles(ctx({ permisosGenerales: new Set(['catalogos.administrar']) }))).toBe(false);
    expect(puedeAdministrarRoles(ctx())).toBe(false);
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
