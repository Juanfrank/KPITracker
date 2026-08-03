import type { Atributo } from '../entities/Atributo';
import type { TypeRegistry } from '../data-types/TypeRegistry';
import type { ValorAtributo } from '../data-types/TypeDescriptor';
import type { ErrorValidacion } from './Validaciones';
import type { ContextoEvaluacion } from './Condicion';
import { EvaluadorReglas } from './EvaluadorReglas';

export interface ResultadoValidacionAtributo {
  atributoId: string;
  errores: ErrorValidacion[];
}

/**
 * Valida el conjunto de valores de atributos de una entidad aplicando:
 * 1. la obligatoriedad (estática o condicional vía motor de reglas);
 * 2. las validaciones declarativas del atributo, delegadas al descriptor
 *    del tipo de dato (TypeRegistry).
 * La visibilidad condicional también se resuelve aquí: un atributo oculto
 * por condición no se valida.
 */
export class ValidadorAtributos {
  constructor(
    private readonly tipos: TypeRegistry,
    private readonly evaluador: EvaluadorReglas = new EvaluadorReglas()
  ) {}

  esVisible(atributo: Atributo, contexto: ContextoEvaluacion): boolean {
    if (!atributo.visible) return false;
    if (atributo.condicionVisibilidad == null) return true;
    return this.evaluador.evaluar(atributo.condicionVisibilidad, contexto);
  }

  esObligatorio(atributo: Atributo, contexto: ContextoEvaluacion): boolean {
    if (atributo.condicionObligatorio != null) {
      return this.evaluador.evaluar(atributo.condicionObligatorio, contexto);
    }
    return atributo.obligatorio || atributo.validaciones.some((v) => v.tipo === 'Obligatorio');
  }

  validar(
    atributos: Atributo[],
    valores: Map<string, ValorAtributo>,
    contexto: ContextoEvaluacion
  ): ResultadoValidacionAtributo[] {
    const resultados: ResultadoValidacionAtributo[] = [];
    for (const atributo of atributos) {
      if (!atributo.activo || !this.esVisible(atributo, contexto)) continue;
      const valor = valores.get(atributo.id) ?? null;
      const errores: ErrorValidacion[] = [];
      const vacio = valor == null || (typeof valor === 'string' && valor.trim() === '') || (Array.isArray(valor) && valor.length === 0);
      if (this.esObligatorio(atributo, contexto) && vacio) {
        errores.push({ validacion: 'Obligatorio', mensaje: `"${atributo.nombre}" es obligatorio.` });
      }
      if (!vacio) {
        const descriptor = this.tipos.obtener(atributo.tipoDato);
        errores.push(...descriptor.validar(valor, atributo.validaciones));
      }
      if (errores.length > 0) resultados.push({ atributoId: atributo.id, errores });
    }
    return resultados;
  }
}
