/** Error base del dominio: permite distinguir fallos de negocio de fallos técnicos. */
export class DominioError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = new.target.name;
  }
}

/** Funcionalidad prevista en la arquitectura pero no desarrollada en esta versión. */
export class NoImplementadoError extends DominioError {}

/** Violación de una regla de negocio o validación. */
export class ValidacionError extends DominioError {
  constructor(
    mensaje: string,
    public readonly detalles: string[] = []
  ) {
    super(mensaje);
  }
}

/** Entidad referenciada que no existe (integridad referencial lógica). */
export class EntidadNoEncontradaError extends DominioError {
  constructor(entidad: string, id: string) {
    super(`${entidad} con id "${id}" no existe.`);
  }
}

/**
 * Escritura rechazada por bloqueo optimista: el cliente editó una celda a
 * partir de una versión (`Resultado.actualizadoEn`) que ya no es la vigente
 * — alguien más la cambió mientras tanto. Deliberadamente "detectar y
 * bloquear" (no fusionar valores ni quedarse con "el último que escribe
 * gana" en silencio, decisión confirmada con el usuario): el llamador debe
 * recargar la celda antes de poder reintentar. Carga la identidad y el
 * valor vigentes para que la UI pueda mostrar "Fulano cambió este valor a
 * X hace unos minutos" sin una segunda consulta.
 */
export class ConflictoConcurrenciaError extends DominioError {
  constructor(
    mensaje: string,
    public readonly capturadoPor: string | null,
    public readonly capturadoEn: string,
    public readonly valorActual: number | null
  ) {
    super(mensaje);
  }
}
