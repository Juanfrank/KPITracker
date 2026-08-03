import type { ElementoLista } from '../entities/Lista';
import type { ClaveDesagregacion } from '../value-objects/ClaveDesagregacion';
import { CLAVE_GENERAL, crearClave } from '../value-objects/ClaveDesagregacion';

export interface CombinacionDesagregacion {
  clave: ClaveDesagregacion;
  /** Descripciones legibles por lista, en el mismo orden que la clave. */
  etiquetas: Array<{ listaId: string; codigo: string; descripcion: string }>;
}

/**
 * Genera las combinaciones de captura para un indicador:
 * - SIEMPRE incluye la fila "General" (el total puede no ser derivable de
 *   las desagregaciones, p. ej. promedios ponderados).
 * - Luego el producto cartesiano de los elementos activos de cada lista de
 *   desagregación seleccionada.
 * - `excluidas` implementa la exclusión temporal por levantamiento: esas
 *   listas no participan del producto, sin modificar la configuración del
 *   indicador.
 */
export class ProductoCartesiano {
  generar(
    desagregaciones: string[],
    elementosPorLista: Map<string, ElementoLista[]>,
    excluidas: string[] = []
  ): CombinacionDesagregacion[] {
    const listasActivas = desagregaciones.filter((id) => !excluidas.includes(id));
    const combinaciones: CombinacionDesagregacion[] = [{ clave: CLAVE_GENERAL, etiquetas: [] }];
    if (listasActivas.length === 0) return combinaciones;

    // Producto cartesiano iterativo, respetando el orden de los elementos.
    let parciales: Array<Array<{ listaId: string; codigo: string; descripcion: string }>> = [[]];
    for (const listaId of listasActivas) {
      const elementos = (elementosPorLista.get(listaId) ?? [])
        .filter((e) => e.activo)
        .sort((a, b) => a.orden - b.orden);
      if (elementos.length === 0) continue;
      const siguientes: typeof parciales = [];
      for (const parcial of parciales) {
        for (const elemento of elementos) {
          siguientes.push([...parcial, { listaId, codigo: elemento.codigo, descripcion: elemento.descripcion }]);
        }
      }
      parciales = siguientes;
    }
    if (parciales.length === 1 && parciales[0]?.length === 0) return combinaciones;

    for (const etiquetas of parciales) {
      combinaciones.push({
        clave: crearClave(etiquetas.map((e) => [e.listaId, e.codigo] as const)),
        etiquetas
      });
    }
    return combinaciones;
  }
}
