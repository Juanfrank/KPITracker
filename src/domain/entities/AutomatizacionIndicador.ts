/** Un parámetro dinámico: un token en el script alimentado por un atributo dinámico del indicador. */
export interface ParametroDinamico {
  /** Nombre del token en el script (se usa como {nombre}). */
  nombre: string;
  /** Atributo dinámico (EAV) del indicador cuyo valor resuelve el token. */
  atributoId: string;
}

/** Asocia una columna del resultado tabular del script a la desagregación (lista) que representa. */
export interface MapeoColumna {
  columna: string;
  listaId: string;
  /**
   * Columna booleana opcional del resultado que indica, fila por fila, si
   * ESTA desagregación viene "enrollada" (subtotal/rollup) en esa fila —
   * el mismo rol que cumplen las columnas `IsSubtotal...` que produce DAX
   * `SUMMARIZECOLUMNS(..., ROLLUPADDISSUBTOTAL(...))`. Cuando está
   * configurada y su valor es verdadero en una fila, esa desagregación se
   * trata como ausente en esa fila (subtotal) en vez de leer `columna`. Sin
   * segmentador, un valor en blanco en `columna` ya se interpreta como
   * "enrollada" — el segmentador es para orígenes que no dejan el valor en
   * blanco en las filas de rollup.
   */
  columnaSegmentadorSubtotal?: string | null;
}

/**
 * Configuración de obtención automática de un indicador: origen, parámetros
 * dinámicos (de sus propios atributos) y generales (del período, resueltos
 * desde `OrigenAutomatico.parametrosGenerales`) que se sustituyen en el
 * script, y el mapeo del resultado tabular a las desagregaciones del
 * indicador. Relación 1:1 con el indicador.
 */
export interface AutomatizacionIndicador {
  readonly id: string;
  readonly indicadorId: string;
  origenAutomaticoId: string;
  parametrosDinamicos: ParametroDinamico[];
  /** Script/consulta a ejecutar contra el origen (p. ej. una sentencia SQL, una ruta+query de API, una expresión MDX). */
  script: string;
  /** Columna del resultado que contiene el valor numérico a capturar; null si aún no se configuró. */
  columnaValor: string | null;
  mapeoColumnas: MapeoColumna[];
  /** Desagregaciones del indicador que este origen no provee: se completan manualmente. */
  desagregacionesOmitidas: string[];
  /**
   * Nombre de la medida DAX del indicador, cuando `script`/`mapeoColumnas`/
   * `columnaValor` fueron generados automáticamente (ver
   * `generarConsultaDax`) en vez de escritos a mano. `null` si la
   * configuración es manual o el origen no es PowerBI.
   */
  medidaDax?: string | null;
  readonly creadoEn: string;
  actualizadoEn: string;
}
