import type { DeadlineRule, ReglaFechaLimiteSpec } from './DeadlineRule';
import type { Periodo } from '../value-objects/Periodo';

/** Registro extensible de reglas de fecha límite (Strategy + Registry). */
export class DeadlineRuleRegistry {
  private readonly reglas = new Map<string, DeadlineRule>();

  registrar(regla: DeadlineRule): void {
    if (this.reglas.has(regla.tipo)) {
      throw new Error(`La regla de fecha límite "${regla.tipo}" ya está registrada.`);
    }
    this.reglas.set(regla.tipo, regla);
  }

  obtener(tipo: string): DeadlineRule {
    const r = this.reglas.get(tipo);
    if (!r) throw new Error(`Regla de fecha límite no registrada: "${tipo}".`);
    return r;
  }

  listar(): DeadlineRule[] {
    return [...this.reglas.values()];
  }

  calcular(spec: ReglaFechaLimiteSpec, periodo: Periodo): string {
    return this.obtener(spec.tipo).calcular(periodo, spec.parametros);
  }
}
