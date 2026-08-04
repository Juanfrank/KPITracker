/**
 * Sustituye tokens `{nombre}` en un script por sus valores resueltos
 * (parámetros dinámicos y generales, ya combinados en un único mapa por el
 * llamador). Los tokens sin valor conocido se dejan intactos en el texto,
 * para que el error sea visible en el resultado en vez de silencioso.
 */
export function sustituirTokens(script: string, valores: ReadonlyMap<string, string>): string {
  return script.replace(/\{([a-zA-Z0-9_]+)\}/g, (coincidencia, nombre: string) =>
    valores.has(nombre) ? (valores.get(nombre) as string) : coincidencia
  );
}

/** Nombres de los tokens `{nombre}` referenciados en un script (para listarlos como ayuda). */
export function tokensReferenciados(script: string): string[] {
  const encontrados = new Set<string>();
  for (const m of script.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) encontrados.add(m[1] as string);
  return [...encontrados];
}
