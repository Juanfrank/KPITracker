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
  readonly creadoEn: string;
  actualizadoEn: string;
}
