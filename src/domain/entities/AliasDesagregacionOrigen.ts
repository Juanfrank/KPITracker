/**
 * Nombre con el que una desagregación (lista) se identifica dentro de los
 * datos de un origen automático específico (p. ej. la lista "Sexo" puede
 * llamarse "GENERO" en el Origen A y "SEX" en el Origen B). Se reutiliza al
 * sugerir el mapeo de columnas de cualquier indicador que use esa misma
 * combinación lista+origen, y es administrable tanto desde el origen como
 * desde la propia lista.
 */
export interface AliasDesagregacionOrigen {
  readonly id: string;
  listaId: string;
  origenAutomaticoId: string;
  alias: string;
  readonly creadoEn: string;
  actualizadoEn: string;
}
