import type { Condicion } from '../rules/Condicion';

export type TipoReglaNegocio = 'Visibilidad' | 'Obligatoriedad' | 'ValidacionCruzada';

/**
 * Regla de negocio declarativa administrada desde el módulo de Reglas.
 * `atributoObjetivoId` es el atributo afectado; `condicion` es el AST que
 * evalúa el motor. Para ValidacionCruzada, la condición debe cumplirse
 * (p. ej. FechaFinal > FechaInicio) o se produce `mensajeError`.
 */
export interface ReglaNegocio {
  readonly id: string;
  nombre: string;
  descripcion: string;
  tipo: TipoReglaNegocio;
  /** Entidad sobre la que aplica ('Indicador'). */
  entidad: string;
  atributoObjetivoId: string | null;
  condicion: Condicion;
  mensajeError: string | null;
  activa: boolean;
  /** Marca de borrado lógico: distinta de `activa`, que el usuario alterna manualmente. */
  eliminado: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}
