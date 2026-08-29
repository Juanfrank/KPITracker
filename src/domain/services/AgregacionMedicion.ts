/**
 * Reglas de agregación compartidas (Batch Y) entre dos features distintas:
 * "Cortes de medición" (Configuración de Metas — agrega, para UN indicador,
 * sus valores de varios períodos hasta un corte global) y "Medición por
 * categoría" (Administración — agrega, para UNA categoría, los valores de
 * VARIOS indicadores en un mismo período). Ambas comparten el mismo
 * vocabulario de reglas y la misma noción de "ponderado" — pedido explícito
 * del usuario, confirmado por `AskUserQuestion`: el peso de una entrada
 * ponderada es 1 si tiene una `Meta` configurada para ese período, 0 si no
 * (con respaldo a promedio simple si NINGUNA entrada tiene meta, para nunca
 * devolver "sin datos" solo por eso).
 */
export type TipoAgregacion = 'promedio' | 'promedioPonderado' | 'maximo' | 'minimo';

export const OPCIONES_AGREGACION: readonly TipoAgregacion[] = ['promedio', 'promedioPonderado', 'maximo', 'minimo'];

export const ETIQUETAS_AGREGACION: Record<TipoAgregacion, string> = {
  promedio: 'Promedio',
  promedioPonderado: 'Promedio ponderado (por meta configurada)',
  maximo: 'Valor máximo',
  minimo: 'Valor mínimo'
};

export function tipoAgregacionValido(valor: string): valor is TipoAgregacion {
  return (OPCIONES_AGREGACION as readonly string[]).includes(valor);
}

/** Una entrada a combinar — un período (Cortes) o un indicador (Categoría), según el contexto. */
export interface EntradaAgregable {
  valor: number;
  /** ¿Tiene esta entrada una Meta configurada? Determina su peso en `'promedioPonderado'`. */
  tieneMeta: boolean;
  /**
   * Peso relativo explícito (Batch Y, medición por categoría — "tratamiento
   * especial" de un indicador dentro del promedio, p. ej. "pesa doble" =
   * `2`). Default `1`. Sin efecto en `'maximo'`/`'minimo'`.
   */
  peso?: number;
}

function pesoEfectivo(entrada: EntradaAgregable, tipo: TipoAgregacion): number {
  const base = entrada.peso ?? 1;
  return tipo === 'promedioPonderado' ? base * (entrada.tieneMeta ? 1 : 0) : base;
}

/**
 * Combina `entradas` según `tipo`. `null` si no hay ninguna entrada (nada
 * que agregar). Para `'promedioPonderado'`: si TODAS las entradas pesan 0
 * (ninguna tiene meta), cae a promedio simple — nunca se devuelve `null`
 * solo porque nadie tenía una meta configurada.
 */
export function agregar(tipo: TipoAgregacion, entradas: readonly EntradaAgregable[]): number | null {
  if (entradas.length === 0) return null;
  if (tipo === 'maximo') return Math.max(...entradas.map((e) => e.valor));
  if (tipo === 'minimo') return Math.min(...entradas.map((e) => e.valor));

  const pares = entradas.map((e) => ({ valor: e.valor, peso: pesoEfectivo(e, tipo) }));
  let sumaPesos = pares.reduce((s, p) => s + p.peso, 0);
  const usarPesoUniforme = sumaPesos === 0;
  if (usarPesoUniforme) sumaPesos = entradas.length;
  const sumaPonderada = pares.reduce((s, p) => s + p.valor * (usarPesoUniforme ? 1 : p.peso), 0);
  return sumaPonderada / sumaPesos;
}
