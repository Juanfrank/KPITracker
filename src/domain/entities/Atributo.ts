import type { TipoDato } from '../value-objects/TipoDato';
import type { ValidacionAtributo } from '../rules/Validaciones';
import type { Condicion } from '../rules/Condicion';

/** Entidades del sistema que admiten atributos dinámicos. */
export type EntidadConAtributos = 'Indicador';

/**
 * Definición de un atributo dinámico. Los atributos NO son fijos:
 * el usuario los crea, modifica, elimina, reordena, agrupa y oculta
 * desde el módulo de Configuración de Atributos.
 */
export interface Atributo {
  readonly id: string;
  /** Entidad a la que extiende este atributo. */
  entidad: EntidadConAtributos;
  nombre: string;
  descripcion: string;
  grupo: string;
  orden: number;
  visible: boolean;
  editable: boolean;
  obligatorio: boolean;
  valorPorDefecto: string | null;
  tipoDato: TipoDato;
  /** Para SelectionList / MultiSelectionList: id de la lista de selección. */
  listaId: string | null;
  /** Validaciones declarativas evaluadas por el ValidadorAtributos. */
  validaciones: ValidacionAtributo[];
  /** Condición declarativa de visibilidad (motor de reglas); null = siempre visible. */
  condicionVisibilidad: Condicion | null;
  /** Condición declarativa de obligatoriedad; null = usa el flag `obligatorio`. */
  condicionObligatorio: Condicion | null;
  /** Si es true, el valor de este atributo se ofrece como filtro en el tablero de Seguimiento. */
  filtrable: boolean;
  activo: boolean;
  /** Marca de borrado lógico (bloqueado por estar en uso): distinta de `activo`, que el usuario alterna manualmente. */
  eliminado: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}
