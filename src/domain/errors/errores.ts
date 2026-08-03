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
