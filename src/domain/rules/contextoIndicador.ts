import type { Atributo } from '../entities/Atributo';
import type { Indicador } from '../entities/Indicador';
import type { ContextoEvaluacion } from './Condicion';
import type { ValorAtributo } from '../data-types/TypeDescriptor';

type Escalar = string | number | boolean | null;

/** Campos fijos del indicador expuestos al motor de reglas por nombre. */
const CAMPOS_FIJOS: Record<string, (i: Indicador) => Escalar> = {
  Nombre: (i) => i.nombre,
  Definicion: (i) => i.definicion,
  Periodicidad: (i) => i.periodicidad,
  LineaBase: (i) => i.lineaBase,
  MetaGlobal: (i) => i.metaGlobal,
  Estado: (i) => i.estado,
  UnidadMedida: (i) => i.unidadMedida,
  Responsable: (i) => i.responsable,
  Categoria: (i) => i.categoria
};

function aEscalar(valor: ValorAtributo | undefined): Escalar {
  if (valor == null) return null;
  if (Array.isArray(valor)) return valor.join('; ');
  return valor;
}

/**
 * Construye el contexto de evaluación del motor de reglas para un
 * indicador: expone los campos fijos por nombre (Nombre, Estado, LineaBase,
 * MetaGlobal...) y los atributos dinámicos por su `Atributo.nombre`.
 *
 * Es la misma función que usan el backend (validación al guardar, en
 * ServicioIndicadores) y el renderer (visibilidad/obligatoriedad en vivo
 * en el formulario), garantizando que ambos evalúan exactamente igual.
 */
export function construirContextoIndicador(
  indicador: Indicador,
  atributos: Atributo[],
  valores: Map<string, ValorAtributo>
): ContextoEvaluacion {
  const porNombre = new Map(atributos.map((a) => [a.nombre, a]));
  return {
    obtenerAtributo(nombre: string): Escalar {
      const atributo = porNombre.get(nombre);
      if (atributo) return aEscalar(valores.get(atributo.id));
      const campoFijo = CAMPOS_FIJOS[nombre];
      return campoFijo ? campoFijo(indicador) : null;
    }
  };
}
