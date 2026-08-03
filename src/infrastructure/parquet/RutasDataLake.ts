import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Organización física del Data Lake local:
 * /Data
 *   /Config      Indicadores, Atributos, Reglas, Listas, ElementosLista, Metas
 *   /Dimensions  DimIndicador, DimPeriodo, DimFecha, DimDesagregacion, ...
 *   /Facts       FactResultados (particionado por año), FactSeguimiento, FactValoresAtributos
 *   /Logs        Auditoria
 *   /Export      Capa analítica desnormalizada (Power BI)
 *   Configuracion.json
 */
export class RutasDataLake {
  constructor(readonly raiz: string) {}

  get config(): string {
    return join(this.raiz, 'Config');
  }
  get dimensions(): string {
    return join(this.raiz, 'Dimensions');
  }
  get facts(): string {
    return join(this.raiz, 'Facts');
  }
  get logs(): string {
    return join(this.raiz, 'Logs');
  }
  get exportacion(): string {
    return join(this.raiz, 'Export');
  }
  get archivoConfiguracion(): string {
    return join(this.raiz, 'Configuracion.json');
  }
  get baseTrabajo(): string {
    return join(this.raiz, 'trabajo.duckdb');
  }
  get factResultadosDir(): string {
    return join(this.facts, 'FactResultados');
  }

  crearDirectorios(): void {
    for (const dir of [this.config, this.dimensions, this.facts, this.logs, this.exportacion]) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
