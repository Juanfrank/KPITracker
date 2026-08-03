import type { Atributo } from '../entities/Atributo';
import type { ReglaNegocio } from '../entities/ReglaNegocio';
import type { TypeRegistry } from '../data-types/TypeRegistry';
import type { ValorAtributo } from '../data-types/TypeDescriptor';
import type { ErrorValidacion } from './Validaciones';
import type { ContextoEvaluacion } from './Condicion';
import { EvaluadorReglas } from './EvaluadorReglas';

export interface ResultadoValidacionAtributo {
  atributoId: string;
  errores: ErrorValidacion[];
}

function reglasPara(reglas: ReglaNegocio[], tipo: ReglaNegocio['tipo'], atributoId: string): ReglaNegocio[] {
  return reglas.filter((r) => r.activa && r.tipo === tipo && r.atributoObjetivoId === atributoId);
}

/**
 * Valida el conjunto de valores de atributos de una entidad aplicando:
 * 1. la visibilidad y obligatoriedad, estáticas o condicionales — la
 *    condición puede venir del propio atributo (`condicionVisibilidad`/
 *    `condicionObligatorio`) o de reglas del módulo Reglas (`ReglaNegocio`
 *    de tipo Visibilidad/Obligatoriedad con `atributoObjetivoId`); ambos
 *    mecanismos son equivalentes y se combinan con AND;
 * 2. las validaciones declarativas del atributo, delegadas al descriptor
 *    del tipo de dato (TypeRegistry).
 * Un atributo oculto por cualquiera de los dos mecanismos no se valida.
 */
export class ValidadorAtributos {
  constructor(
    private readonly tipos: TypeRegistry,
    private readonly evaluador: EvaluadorReglas = new EvaluadorReglas()
  ) {}

  esVisible(atributo: Atributo, contexto: ContextoEvaluacion, reglas: ReglaNegocio[] = []): boolean {
    if (!atributo.visible) return false;
    if (atributo.condicionVisibilidad != null && !this.evaluador.evaluar(atributo.condicionVisibilidad, contexto)) {
      return false;
    }
    return reglasPara(reglas, 'Visibilidad', atributo.id).every((r) => this.evaluador.evaluar(r.condicion, contexto));
  }

  esObligatorio(atributo: Atributo, contexto: ContextoEvaluacion, reglas: ReglaNegocio[] = []): boolean {
    if (atributo.condicionObligatorio != null) {
      return this.evaluador.evaluar(atributo.condicionObligatorio, contexto);
    }
    const reglasObligatoriedad = reglasPara(reglas, 'Obligatoriedad', atributo.id);
    if (reglasObligatoriedad.length > 0) {
      return reglasObligatoriedad.some((r) => this.evaluador.evaluar(r.condicion, contexto));
    }
    return atributo.obligatorio || atributo.validaciones.some((v) => v.tipo === 'Obligatorio');
  }

  validar(
    atributos: Atributo[],
    valores: Map<string, ValorAtributo>,
    contexto: ContextoEvaluacion,
    reglas: ReglaNegocio[] = []
  ): ResultadoValidacionAtributo[] {
    const resultados: ResultadoValidacionAtributo[] = [];
    for (const atributo of atributos) {
      if (!atributo.activo || !this.esVisible(atributo, contexto, reglas)) continue;
      const valor = valores.get(atributo.id) ?? null;
      const errores: ErrorValidacion[] = [];
      const vacio = valor == null || (typeof valor === 'string' && valor.trim() === '') || (Array.isArray(valor) && valor.length === 0);
      if (this.esObligatorio(atributo, contexto, reglas) && vacio) {
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

  /** Evalúa las reglas `ValidacionCruzada` activas de una entidad; retorna los mensajes incumplidos. */
  validarCruzadas(reglas: ReglaNegocio[], entidad: string, contexto: ContextoEvaluacion): string[] {
    const incumplidas: string[] = [];
    for (const regla of reglas) {
      if (!regla.activa || regla.tipo !== 'ValidacionCruzada' || regla.entidad !== entidad) continue;
      if (!this.evaluador.evaluar(regla.condicion, contexto)) {
        incumplidas.push(regla.mensajeError ?? `No se cumple la regla "${regla.nombre}".`);
      }
    }
    return incumplidas;
  }
}
