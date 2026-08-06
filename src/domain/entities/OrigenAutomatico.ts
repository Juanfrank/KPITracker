/** Tipo de conexión del origen automático de resultados. */
export type TipoOrigenAutomatico = 'XMLA' | 'SQL' | 'API';

/**
 * De dónde se toma el valor de un parámetro general (relativo al período)
 * al sustituirlo en el script de un indicador. Permite que cada origen
 * exprese el período como un valor único, un rango de fechas, campos de
 * año/mes separados (numéricos o textuales), o listas de meses — sin
 * necesidad de variantes rígidas: cada fila es "un token, una fuente".
 */
export type FuenteParametroGeneral =
  | 'PeriodoId'
  | 'PeriodoEtiqueta'
  | 'FechaInicio'
  | 'FechaFin'
  | 'Anio'
  | 'MesNumero'
  | 'MesNombre'
  | 'MesesNumeroLista'
  | 'MesesNombreLista'
  | 'Numero'
  | 'Periodicidad';

/** Un parámetro general configurable: nombre del token en el script + de dónde sale su valor. */
export interface ParametroGeneral {
  /** Nombre del token tal como aparece en el script, p. ej. "fechaDesde" (se usa como {fechaDesde}). */
  nombre: string;
  fuente: FuenteParametroGeneral;
}

/**
 * Origen de datos externo configurado para obtener resultados de forma
 * automática. `configuracion` guarda pares clave/valor específicos del tipo
 * (credenciales, cadena de conexión, endpoint, etc.). `parametrosGenerales`
 * define cómo se nombran y de dónde salen los parámetros relativos al
 * período al sustituirlos en el script de cada indicador.
 */
export interface OrigenAutomatico {
  readonly id: string;
  nombre: string;
  tipo: TipoOrigenAutomatico;
  descripcion: string;
  configuracion: Record<string, string>;
  parametrosGenerales: ParametroGeneral[];
  activo: boolean;
  /** Marca de borrado lógico (bloqueado por estar en uso): distinta de `activo`, que el usuario alterna manualmente. */
  eliminado: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}
