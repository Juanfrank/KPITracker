import { describe, expect, it } from 'vitest';
import { ProductoCartesiano } from '@domain/services/ProductoCartesiano';
import { ordenarComoArbol } from '@domain/services/ArbolDesagregaciones';
import type { ElementoLista } from '@domain/entities/Lista';
import { claveATexto } from '@domain/value-objects/ClaveDesagregacion';

function elemento(listaId: string, codigo: string, orden: number): ElementoLista {
  return { id: `${listaId}-${codigo}`, listaId, codigo, nombre: codigo, descripcion: '', orden, padreCodigo: null, activo: true };
}

const servicio = new ProductoCartesiano();

const elementos = new Map<string, ElementoLista[]>([
  ['sexo', [elemento('sexo', 'M', 1), elemento('sexo', 'F', 2)]],
  ['region', [elemento('region', 'N', 1), elemento('region', 'S', 2)]],
  ['anio', [elemento('anio', '2025', 1), elemento('anio', '2026', 2)]]
]);

function claves(combos: ReturnType<typeof servicio.generar>): string[] {
  return combos.map((c) => claveATexto(c.clave));
}

describe('ordenarComoArbol', () => {
  it('con una sola desagregación, el orden ya es el de "drill-down" (sin cambios frente al cubo)', () => {
    const cubo = servicio.generar(['sexo'], elementos);
    const arbol = ordenarComoArbol(cubo, ['sexo']);
    expect(claves(arbol)).toEqual(['GENERAL', 'sexo=M', 'sexo=F']);
  });

  it('con dos desagregaciones, cuelga el detalle del subtotal de la 1a desagregación configurada — no de la 2a', () => {
    const cubo = servicio.generar(['sexo', 'region'], elementos);
    const arbol = ordenarComoArbol(cubo, ['sexo', 'region']);
    // Total general -> Sexo=M (subtotal) -> [Sexo=M,Región=N] -> [Sexo=M,Región=S]
    //              -> Sexo=F (subtotal) -> [Sexo=F,Región=N] -> [Sexo=F,Región=S]
    //              -> Región=N (subtotal, hoja: sin descendientes) -> Región=S (subtotal, hoja)
    expect(claves(arbol)).toEqual([
      'GENERAL',
      'sexo=M', 'region=N|sexo=M', 'region=S|sexo=M',
      'sexo=F', 'region=N|sexo=F', 'region=S|sexo=F',
      'region=N', 'region=S'
    ]);
  });

  it('la profundidad (nivel) coincide exactamente con la cantidad de desagregaciones presentes en cada nodo', () => {
    const cubo = servicio.generar(['sexo', 'region'], elementos);
    const arbol = ordenarComoArbol(cubo, ['sexo', 'region']);
    for (const nodo of arbol) expect(nodo.nivel).toBe(nodo.etiquetas.length);
  });

  it('invertir el orden de configuración invierte qué desagregación queda como rama principal', () => {
    const cubo = servicio.generar(['sexo', 'region'], elementos);
    const arbol = ordenarComoArbol(cubo, ['region', 'sexo']);
    expect(claves(arbol)).toEqual([
      'GENERAL',
      'region=N', 'region=N|sexo=M', 'region=N|sexo=F',
      'region=S', 'region=S|sexo=M', 'region=S|sexo=F',
      'sexo=M', 'sexo=F'
    ]);
  });

  it('no pierde ni duplica ninguna combinación del cubo original', () => {
    const cubo = servicio.generar(['sexo', 'region', 'anio'], elementos);
    const arbol = ordenarComoArbol(cubo, ['sexo', 'region', 'anio']);
    expect(arbol).toHaveLength(cubo.length);
    expect(new Set(claves(arbol))).toEqual(new Set(claves(cubo)));
  });

  it('con tres desagregaciones, un subtotal de 2 (en orden de config) cuelga del subtotal de la primera de las dos', () => {
    const cubo = servicio.generar(['sexo', 'region', 'anio'], elementos);
    const arbol = ordenarComoArbol(cubo, ['sexo', 'region', 'anio']);
    const indiceSexoM = claves(arbol).indexOf('sexo=M');
    const indiceSexoMRegionN = claves(arbol).indexOf('region=N|sexo=M');
    const indiceDetalleCompleto = claves(arbol).indexOf('anio=2025|region=N|sexo=M');
    // El detalle completo (las 3 presentes) debe aparecer DESPUÉS de su subtotal
    // de 2 (sexo+región), que a su vez aparece después del subtotal de 1 (sexo).
    expect(indiceSexoM).toBeGreaterThanOrEqual(0);
    expect(indiceSexoMRegionN).toBeGreaterThan(indiceSexoM);
    expect(indiceDetalleCompleto).toBeGreaterThan(indiceSexoMRegionN);
  });

  it('respeta el `orden` de los elementos, no el orden alfabético del código', () => {
    const invertidos = new Map(elementos);
    // "F" tiene orden=1 (antes que "M", orden=2): el árbol debe listar F primero.
    invertidos.set('sexo', [elemento('sexo', 'F', 1), elemento('sexo', 'M', 2)]);
    const cubo = servicio.generar(['sexo'], invertidos);
    const arbol = ordenarComoArbol(cubo, ['sexo']);
    expect(claves(arbol)).toEqual(['GENERAL', 'sexo=F', 'sexo=M']);
  });

  it('sin desagregaciones, devuelve solo General', () => {
    const cubo = servicio.generar([], elementos);
    const arbol = ordenarComoArbol(cubo, []);
    expect(claves(arbol)).toEqual(['GENERAL']);
  });
});
