/** Flujo de aprobación de resultados (Batch T) — capa de validación post-registro, no bloquea la captura. */
export type EstadoValidacionResultado = 'Pendiente' | 'Validado' | 'Rechazado';

/**
 * Resultado levantado para un indicador, un período y una combinación de
 * desagregación (o la fila General). Grano de FactResultados.
 *
 * `estadoValidacion`/`validadoPor`/`validadoEn`/`comentarioValidacion`
 * (Batch T): capa de aprobación posterior al registro — puramente
 * informativa, nunca impide guardar un valor nuevo. Editar `valor`/
 * `observacion` de un resultado ya `Validado`/`Rechazado` lo regresa a
 * `Pendiente` y limpia los tres campos de validación (ver
 * `ServicioRecoleccion.guardarCelda`), para que un valor validado en pantalla
 * siempre corresponda a lo último capturado.
 */
/**
 * Cómo se obtuvo el valor VIGENTE de un `Resultado` (Batch AV, pedido
 * explícito del usuario) — 'Automatico' solo cuando vino de
 * `ServicioRecoleccion.obtenerResultadoAutomatico`; 'Manual' en cualquier
 * otro caso (captura a mano, pegado desde Excel, o restaurar una versión
 * previa — todas acciones deliberadas de una persona).
 */
export type OrigenCapturaResultado = 'Manual' | 'Automatico';

export interface Resultado {
  readonly id: string;
  indicadorId: string;
  /** Id estable del período: "2025-Mensual-01". */
  periodoId: string;
  anio: number;
  /** Serialización canónica de ClaveDesagregacion ('GENERAL' para el total). */
  claveDesagregacion: string;
  valor: number | null;
  /** Comentario u observación opcional del levantamiento. */
  observacion: string | null;
  estadoValidacion: EstadoValidacionResultado;
  /** Id del usuario que validó/rechazó — null mientras esté `Pendiente`. */
  validadoPor: string | null;
  validadoEn: string | null;
  comentarioValidacion: string | null;
  /** Batch AV — ver `OrigenCapturaResultado`. */
  origenCaptura: OrigenCapturaResultado;
  /** Usuario que escribió el valor vigente (última escritura de `valor`/`observacion`). */
  capturadoPor: string | null;
  /**
   * Fecha/hora de esa escritura — a diferencia de `actualizadoEn`, NO cambia
   * al validar/rechazar (Batch T), así que es la fuente confiable de "cuándo
   * se capturó el dato actual".
   */
  capturadoEn: string;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/**
 * Versión histórica de un Resultado. Se agrega una entrada append-only cada
 * vez que `valor`/`observacion` cambian, permitiendo consultar versiones
 * previas y hacer rollback sin perder el rastro de lo capturado.
 */
export interface ResultadoHistorial {
  readonly id: string;
  indicadorId: string;
  periodoId: string;
  claveDesagregacion: string;
  /** Número de versión, incremental desde 1 por (indicadorId, periodoId, claveDesagregacion). */
  version: number;
  valor: number | null;
  observacion: string | null;
  usuario: string;
  actualizadoEn: string;
}

/**
 * Estado del levantamiento de un indicador para un período: fecha de corte
 * única y obligatoria, y exclusiones temporales de desagregación que nunca
 * modifican la configuración del indicador.
 */
export interface Levantamiento {
  readonly id: string;
  indicadorId: string;
  periodoId: string;
  anio: number;
  /** Fecha de corte ISO (yyyy-MM-dd), compartida por todas las desagregaciones del período. */
  fechaCorte: string | null;
  /** Ids de listas de desagregación excluidas temporalmente en este período. */
  desagregacionesExcluidas: string[];
  /** Comentario opcional del levantamiento (a nivel indicador+período, no por celda). */
  comentario: string | null;
  readonly creadoEn: string;
  actualizadoEn: string;
}
