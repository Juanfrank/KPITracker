/**
 * Tipo de conexión del origen automático de resultados. `XMLA` es un cliente
 * SOAP crudo de mejor esfuerzo: sirve contra SSAS on-premise clásico
 * (gateway `msmdpump.dll`, que sí habla XMLA/SOAP plano sobre HTTP), pero
 * NO contra Power BI Premium/Fabric ni Azure Analysis Services — esos
 * exponen "un endpoint XMLA" solo como una convención de nombre de conexión
 * que el proveedor propietario MSOLAP traduce a su protocolo nativo
 * (documentado por Microsoft: "client applications don't communicate
 * directly with the XMLA endpoint... they use client libraries as an
 * abstraction layer"); un POST SOAP crudo a esa URL nunca completa la sesión
 * y falla (típicamente HTTP 404). `PowerBI` es el tipo correcto para
 * datasets/semantic models de Power BI en la nube: usa la API REST pública
 * "Execute Queries" (DAX, HTTPS+JSON estándar, documentada), que sí es
 * alcanzable con un cliente HTTP de mejor esfuerzo — ver ConectorPowerBI.
 */
export type TipoOrigenAutomatico = 'XMLA' | 'SQL' | 'API' | 'PowerBI';

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
