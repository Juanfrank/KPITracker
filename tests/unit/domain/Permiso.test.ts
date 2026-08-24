import { describe, expect, it } from 'vitest';
import { CATALOGO_PERMISOS, agruparPermisosParaGrid } from '@domain/entities/Permiso';

describe('agruparPermisosParaGrid', () => {
  const filas = agruparPermisosParaGrid();

  it('cada permiso del catálogo aparece exactamente una vez, en la columna de su ámbito', () => {
    const idsEnGrid = filas.flatMap((f) => [f.general?.id, f.equipo?.id]).filter((id): id is string => !!id);
    expect(idsEnGrid.sort()).toEqual(CATALOGO_PERMISOS.map((p) => p.id).sort());
    for (const fila of filas) {
      if (fila.general) expect(fila.general.ambito).toBe('general');
      if (fila.equipo) expect(fila.equipo.ambito).toBe('equipo');
    }
  });

  it('agrupa el mismo concepto en una sola fila cuando existe tanto la versión general como la de equipo', () => {
    const filaResultadosVer = filas.find((f) => f.general?.id === 'resultados.ver.todos');
    expect(filaResultadosVer?.equipo?.id).toBe('resultados.ver.equipo');
  });

  it('deja en null la columna cuando el concepto no tiene contraparte en ese ámbito', () => {
    const filaCatalogos = filas.find((f) => f.general?.id === 'catalogos.administrar');
    expect(filaCatalogos?.equipo).toBeNull();

    const filaMiembros = filas.find((f) => f.equipo?.id === 'equipo.miembros.gestionar');
    expect(filaMiembros?.general).toBeNull();
  });

  it('toda fila tiene al menos una columna con un permiso', () => {
    for (const fila of filas) {
      expect(fila.general || fila.equipo).toBeTruthy();
    }
  });
});
