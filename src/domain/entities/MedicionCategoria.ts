import type { TipoAgregacion } from '../services/AgregacionMedicion';

/**
 * Tratamiento especial de UN indicador dentro del cálculo de su categoría
 * (Batch Y, confirmado con el usuario vía `AskUserQuestion`: "peso/
 * tratamiento especial" — el resto de los indicadores entra al promedio de
 * la categoría en igualdad de condiciones; una entrada aquí le da a ESE
 * indicador un trato distinto):
 * - `excluir`: se ignora por completo en el cálculo de esta categoría.
 * - `peso`: multiplica su influencia relativa (`2` = "pesa doble"); default `1`.
 * - `agregacionPropia`: en vez de aportar su valor GENERAL del período, aporta
 *   `agregar(agregacionPropia, sus propias desagregaciones)` — p. ej. el
 *   máximo entre sus regiones, en vez del valor general.
 * Las tres son independientes y combinables (p. ej. peso 2 + agregación propia).
 */
export interface TratamientoIndicadorMedicion {
  excluir?: boolean;
  peso?: number;
  agregacionPropia?: TipoAgregacion;
}

/**
 * Configuración de "¿cómo se calcula el resultado del período para el
 * conjunto de indicadores de esta categoría?" (Batch Y, pedido explícito del
 * usuario) — 1:1 con una `Categoria` (incluida subcategoría: es una
 * categoría más, con su propia configuración independiente). `reglaGeneral`
 * combina los valores de TODOS los indicadores de la categoría (directos;
 * las subcategorías se calculan aparte, con su propia configuración — no hay
 * "herencia" automática de la regla del padre); `tratamientoIndicadores` da
 * excepciones puntuales.
 */
export interface ConfiguracionMedicionCategoria {
  readonly categoriaId: string;
  reglaGeneral: TipoAgregacion;
  tratamientoIndicadores: Record<string, TratamientoIndicadorMedicion>;
  actualizadoEn: string;
}

/** Resultado de calcular la medición de una categoría para un período — lo que devuelve `ServicioMedicionCategoria.calcular`. */
export interface ResultadoMedicionCategoria {
  categoriaId: string;
  regla: TipoAgregacion;
  valorAgregado: number | null;
  /** Cuántos indicadores directos de la categoría entraron en el cálculo (después de aplicar exclusiones). */
  indicadoresConsiderados: number;
}
