import type { Periodicidad } from '../value-objects/Periodicidad';

/**
 * Método de agregación de resultados contra el cual se compara la meta.
 * Extensible: nuevos métodos se registran en MetodoCalculoRegistry sin
 * modificar los existentes.
 */
export type MetodoCalculo = 'Promedio' | 'Sumatoria' | 'UltimoValor' | 'Maximo' | 'Minimo';

/**
 * Meta de un indicador. Puede ser global (claveDesagregacion = 'GENERAL')
 * o específica de una combinación de desagregación.
 */
export interface Meta {
  readonly id: string;
  indicadorId: string;
  /** Serialización canónica de ClaveDesagregacion ('GENERAL' = meta global). */
  claveDesagregacion: string;
  valor: number;
  /** Periodicidad con la que se mide el cumplimiento de la meta. */
  periodicidadMedicion: Periodicidad;
  /** Id de DefinicionPeriodicidad; requerido cuando periodicidadMedicion = Personalizada. */
  periodicidadPersonalizadaId: string | null;
  metodoCalculo: MetodoCalculo;
  anioVigencia: number;
  readonly creadoEn: string;
  actualizadoEn: string;
}
