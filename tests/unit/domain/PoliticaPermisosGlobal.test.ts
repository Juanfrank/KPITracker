import { describe, expect, it } from 'vitest';
import type { ContextoPermisos } from '@domain/index';
import {
  puedeAdministrarRolesGlobales, puedeAdministrarWorkspaces, puedeCambiarWorkspace, puedeCrearWorkspaces,
  puedeEliminarWorkspaces
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
    ...parcial
  };
}

describe('PoliticaPermisosGlobal (Batch AX)', () => {
  it('esAdministrador puede cualquier acción global, aunque no tenga ningún permiso global explícito', () => {
    const c = ctx({ esAdministrador: true });
    expect(puedeCrearWorkspaces(c)).toBe(true);
    expect(puedeAdministrarWorkspaces(c)).toBe(true);
    expect(puedeEliminarWorkspaces(c)).toBe(true);
    expect(puedeCambiarWorkspace(c)).toBe(true);
    expect(puedeAdministrarRolesGlobales(c)).toBe(true);
  });

  it('sin esAdministrador ni permisos globales, ninguna acción global está permitida', () => {
    const c = ctx();
    expect(puedeCrearWorkspaces(c)).toBe(false);
    expect(puedeAdministrarWorkspaces(c)).toBe(false);
    expect(puedeEliminarWorkspaces(c)).toBe(false);
    expect(puedeCambiarWorkspace(c)).toBe(false);
    expect(puedeAdministrarRolesGlobales(c)).toBe(false);
  });

  it('cada permiso global habilita solo su propia acción, no las demás', () => {
    expect(puedeCrearWorkspaces(ctx({ permisosGlobales: new Set(['workspaces.crear']) }))).toBe(true);
    expect(puedeAdministrarWorkspaces(ctx({ permisosGlobales: new Set(['workspaces.crear']) }))).toBe(false);

    expect(puedeAdministrarWorkspaces(ctx({ permisosGlobales: new Set(['workspaces.administrar']) }))).toBe(true);
    expect(puedeEliminarWorkspaces(ctx({ permisosGlobales: new Set(['workspaces.administrar']) }))).toBe(false);

    expect(puedeEliminarWorkspaces(ctx({ permisosGlobales: new Set(['workspaces.eliminar']) }))).toBe(true);
    expect(puedeCambiarWorkspace(ctx({ permisosGlobales: new Set(['workspaces.eliminar']) }))).toBe(false);

    expect(puedeCambiarWorkspace(ctx({ permisosGlobales: new Set(['workspaces.cambiar']) }))).toBe(true);
    expect(puedeAdministrarRolesGlobales(ctx({ permisosGlobales: new Set(['workspaces.cambiar']) }))).toBe(false);

    expect(puedeAdministrarRolesGlobales(ctx({ permisosGlobales: new Set(['rolesGlobales.administrar']) }))).toBe(true);
    expect(puedeCrearWorkspaces(ctx({ permisosGlobales: new Set(['rolesGlobales.administrar']) }))).toBe(false);
  });
});
