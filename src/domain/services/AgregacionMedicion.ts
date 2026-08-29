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
 *
 * Batch Z (pedido explícito del usuario): seis reglas nuevas, agregadas
 * "para los cortes de medición" — `agregar()` las soporta todas (una sola
 * implementación, sin ramas por feature), pero `OPCIONES_AGREGACION` (la
 * lista que ofrece Medición por categoría) NO cambia — las nuevas solo se
 * exponen vía `OPCIONES_AGREGACION_CORTES`, y `ServicioMedicionCategoria`
 * las rechaza en validación (`tipoAgregacionBaseValido`). `primerValor`/
 * `ultimoValor` dependen del ORDEN de `entradas` tal como las arma el
 * llamador — para Cortes, `ServicioCortesMedicion` ya itera los períodos en
 * orden cronológico, así que "primero"/"último" es correcto sin ordenar de
 * nuevo acá.
 */
export type TipoAgregacion =
  | 'promedio'
  | 'promedioPonderado'
  | 'maximo'
  | 'minimo'
  | 'mejorValor'
  | 'peorValor'
  | 'suma'
  | 'mediana'
  | 'primerValor'
  | 'ultimoValor';

/** Reglas base — las únicas válidas para Medición por categoría. */
export const OPCIONES_AGREGACION: readonly TipoAgregacion[] = ['promedio', 'promedioPonderado', 'maximo', 'minimo'];

/** Reglas base + las 6 nuevas de Batch Z — solo válidas/ofrecidas para Cortes de medición. */
export const OPCIONES_AGREGACION_CORTES: readonly TipoAgregacion[] = [
  ...OPCIONES_AGREGACION,
  'mejorValor',
  'peorValor',
  'suma',
  'mediana',
  'primerValor',
  'ultimoValor'
];

export const ETIQUETAS_AGREGACION: Record<TipoAgregacion, string> = {
  promedio: 'Promedio',
  promedioPonderado: 'Promedio ponderado (por meta configurada)',
  maximo: 'Valor máximo',
  minimo: 'Valor mínimo',
  // Batch Z: sin un campo de "sentido deseado" en Indicador todavía (mayor-es-mejor vs.
  // menor-es-mejor), se asume mayor=mejor — mismo cálculo que 'maximo'/'minimo', con un
  // nombre pensado para cuando ese campo exista y pueda invertir el sentido por indicador.
  mejorValor: 'Mejor valor',
  peorValor: 'Peor valor',
  suma: 'Sumatoria',
  mediana: 'Mediana',
  primerValor: 'Primer valor',
  ultimoValor: 'Último valor'
};

export function tipoAgregacionValido(valor: string): valor is TipoAgregacion {
  return (OPCIONES_AGREGACION_CORTES as readonly string[]).includes(valor);
}

/** Igual que `tipoAgregacionValido`, pero solo acepta las reglas base — usado por Medición por categoría (Batch Z: las 6 nuevas son exclusivas de Cortes). */
export function tipoAgregacionBaseValido(valor: string): valor is TipoAgregacion {
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
   * `2`). Default `1`. Sin efecto en `'maximo'`/`'minimo'`/`'mejorValor'`/
   * `'peorValor'`/`'suma'`/`'mediana'`/`'primerValor'`/`'ultimoValor'`.
   */
  peso?: number;
}

/**
 * Redondeo matemático REAL a 2 decimales (pedido explícito del usuario: no
 * es de presentación — cambia el valor mismo, no solo cómo se muestra).
 * Aplica en cada punto de cálculo donde puede introducirse ruido de punto
 * flotante o precisión arbitraria: metas y resultados al guardarse,
 * `agregar()` acá mismo, el % de cumplimiento, y los cálculos intermedios
 * de Cortes/Medición por categoría.
 */
export function redondear2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function pesoEfectivo(entrada: EntradaAgregable, tipo: TipoAgregacion): number {
  const base = entrada.peso ?? 1;
  return tipo === 'promedioPonderado' ? base * (entrada.tieneMeta ? 1 : 0) : base;
}

function mediana(valores: readonly number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 !== 0 ? ordenados[mitad]! : (ordenados[mitad - 1]! + ordenados[mitad]!) / 2;
}

/**
 * Combina `entradas` según `tipo`. `null` si no hay ninguna entrada (nada
 * que agregar). Para `'promedioPonderado'`: si TODAS las entradas pesan 0
 * (ninguna tiene meta), cae a promedio simple — nunca se devuelve `null`
 * solo porque nadie tenía una meta configurada.
 */
export function agregar(tipo: TipoAgregacion, entradas: readonly EntradaAgregable[]): number | null {
  if (entradas.length === 0) return null;
  const valores = entradas.map((e) => e.valor);

  const resultado = ((): number => {
    switch (tipo) {
      case 'maximo':
      case 'mejorValor':
        return Math.max(...valores);
      case 'minimo':
      case 'peorValor':
        return Math.min(...valores);
      case 'suma':
        return valores.reduce((s, v) => s + v, 0);
      case 'mediana':
        return mediana(valores);
      case 'primerValor':
        return entradas[0]!.valor;
      case 'ultimoValor':
        return entradas[entradas.length - 1]!.valor;
      case 'promedio':
      case 'promedioPonderado':
      default: {
        const pares = entradas.map((e) => ({ valor: e.valor, peso: pesoEfectivo(e, tipo) }));
        let sumaPesos = pares.reduce((s, p) => s + p.peso, 0);
        const usarPesoUniforme = sumaPesos === 0;
        if (usarPesoUniforme) sumaPesos = entradas.length;
        const sumaPonderada = pares.reduce((s, p) => s + p.valor * (usarPesoUniforme ? 1 : p.peso), 0);
        return sumaPonderada / sumaPesos;
      }
    }
  })();
  // Redondeo matemático real a 2 decimales (pedido explícito del usuario) — no solo para
  // mostrar: el valor agregado mismo queda con esta precisión de acá en adelante.
  return redondear2(resultado);
}
