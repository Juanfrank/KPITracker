/**
 * Identifica una combinación de desagregación de un resultado.
 * Mapa ordenado listaId -> código de elemento. La combinación vacía
 * representa la fila "General" (resultado total del indicador), que existe
 * siempre porque el total puede no ser derivable de las desagregaciones.
 */
export interface ClaveDesagregacion {
  /** Pares [listaId, codigoElemento] ordenados por listaId. */
  readonly pares: ReadonlyArray<readonly [string, string]>;
}

export const CLAVE_GENERAL: ClaveDesagregacion = { pares: [] };

export function esGeneral(clave: ClaveDesagregacion): boolean {
  return clave.pares.length === 0;
}

/** Serialización canónica estable, apta como clave técnica en persistencia. */
export function claveATexto(clave: ClaveDesagregacion): string {
  if (esGeneral(clave)) return 'GENERAL';
  return clave.pares.map(([lista, codigo]) => `${lista}=${codigo}`).join('|');
}

export function textoAClave(texto: string): ClaveDesagregacion {
  if (texto === 'GENERAL' || texto === '') return CLAVE_GENERAL;
  const pares = texto.split('|').map((par) => {
    const idx = par.indexOf('=');
    if (idx < 0) throw new Error(`Clave de desagregación inválida: "${texto}"`);
    return [par.slice(0, idx), par.slice(idx + 1)] as const;
  });
  return crearClave(pares);
}

/** Normaliza (ordena por listaId) para garantizar canonicidad. */
export function crearClave(pares: ReadonlyArray<readonly [string, string]>): ClaveDesagregacion {
  const ordenados = [...pares].sort((a, b) => a[0].localeCompare(b[0]));
  return { pares: ordenados };
}
