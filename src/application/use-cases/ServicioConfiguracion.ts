import type { ConfiguracionGeneral } from '@domain/index';
import type { DeadlineRuleRegistry } from '@domain/index';
import type { IConfiguracionRepository } from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';

export interface ReglaFechaLimiteDisponible {
  tipo: string;
  etiqueta: string;
  parametros: Array<{ nombre: string; etiqueta: string; tipo: 'number' | 'weekday'; min?: number; max?: number }>;
}

export class ServicioConfiguracion extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IConfiguracionRepository,
    private readonly reglasFechaLimite: DeadlineRuleRegistry
  ) {
    super(ctx);
  }

  obtener(): Promise<ConfiguracionGeneral> {
    return this.repo.obtener();
  }

  async guardar(config: ConfiguracionGeneral): Promise<void> {
    // Valida que la regla exista y sea calculable antes de persistir.
    this.reglasFechaLimite.obtener(config.reglaFechaLimite.tipo);
    const anterior = await this.repo.obtener();
    await this.repo.guardar(config);
    await this.auditar('Modificar', 'ConfiguracionGeneral', 'global', null, JSON.stringify(anterior), JSON.stringify(config));
    this.sincronizarExport();
  }

  reglasDisponibles(): ReglaFechaLimiteDisponible[] {
    return this.reglasFechaLimite.listar().map((r) => ({
      tipo: r.tipo,
      etiqueta: r.etiqueta,
      parametros: [...r.parametros]
    }));
  }
}
