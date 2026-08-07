import type { ElementoLista } from '../entities/Lista';
import type { ClaveDesagregacion } from '../value-objects/ClaveDesagregacion';
import { CLAVE_GENERAL, crearClave } from '../value-objects/ClaveDesagregacion';

export interface CombinacionDesagregacion {
  clave: ClaveDesagregacion;
  /** Descripciones legibles por lista, en el mismo orden que la clave. Ausente = desagregación "enrollada" (subtotal) en esta combinación. */
  etiquetas: Array<{ listaId: string; codigo: string; descripcion: string }>;
  /** Cantidad de desagregaciones presentes en esta combinación (0 = General, N = detalle completo). */
  nivel: number;
}

/**
 * Genera las combinaciones de captura de un indicador como un CUBO completo
 * (equivalente a SQL `CUBE` / DAX `SUMMARIZECOLUMNS` con
 * `ROLLUPADDISSUBTOTAL`), no solo General + detalle completo: para N
 * desagregaciones activas, genera las 2^N combinaciones de "presente vs
 * enrollada (subtotal)" por desagregación —
 * - nivel 0: la fila "General" (todas enrolladas; el total puede no ser
 *   derivable de las desagregaciones, p. ej. promedios ponderados);
 * - nivel k (0 < k < N): un subtotal por cada combinación de k
 *   desagregaciones presentes, con el resto enrolladas;
 * - nivel N: el detalle completo (producto cartesiano de todas), el único
 *   nivel que existía antes de este cambio.
 * `excluidas` implementa la exclusión temporal por levantamiento: esas
 * listas no participan en absoluto (ni presentes ni contribuyen niveles).
 */
export class ProductoCartesiano {
  generar(
    desagregaciones: string[],
    elementosPorLista: Map<string, ElementoLista[]>,
    excluidas: string[] = []
  ): CombinacionDesagregacion[] {
    const listasActivas = desagregaciones.filter((id) => !excluidas.includes(id));
    if (listasActivas.length === 0) return [{ clave: CLAVE_GENERAL, etiquetas: [], nivel: 0 }];

    type Opcion = { listaId: string; codigo: string; descripcion: string } | null;

    // Para cada lista, sus opciones de fila: `null` (enrollada/ausente en esta
    // combinación) + un elemento activo por opción. El producto cartesiano de
    // estas opciones sobre TODAS las listas genera el cubo completo: cada
    // lista aporta un factor de (1 + cantidadDeElementosActivos).
    let parciales: Opcion[][] = [[]];
    for (const listaId of listasActivas) {
      const elementos = (elementosPorLista.get(listaId) ?? [])
        .filter((e) => e.activo)
        .sort((a, b) => a.orden - b.orden);
      const opciones: Opcion[] = [null, ...elementos.map((e) => ({ listaId, codigo: e.codigo, descripcion: e.nombre }))];
      const siguientes: Opcion[][] = [];
      for (const parcial of parciales) {
        for (const opcion of opciones) siguientes.push([...parcial, opcion]);
      }
      parciales = siguientes;
    }

    const combinaciones = parciales.map((combinacion) => {
      const etiquetas = combinacion.filter((x): x is Exclude<Opcion, null> => x != null);
      return {
        clave: etiquetas.length === 0 ? CLAVE_GENERAL : crearClave(etiquetas.map((e) => [e.listaId, e.codigo] as const)),
        etiquetas,
        nivel: etiquetas.length
      };
    });

    // Se agrupa por nivel (General primero, luego subtotales de a una desagregación,
    // luego de a dos, ..., hasta el detalle completo) preservando, dentro de cada
    // nivel, el orden natural en que el producto cartesiano las generó — sort estable.
    return combinaciones.sort((a, b) => a.nivel - b.nivel);
  }
}
