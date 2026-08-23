import type { RutasDataLake } from '../parquet/RutasDataLake';
import type { IExportService } from '@application/ports/index';

/**
 * Implementación TEMPORAL de la capa de exportación analítica (Power BI).
 *
 * La implementación original generaba el star schema y `ResultadosAnalitico
 * .parquet/.csv` con SQL específico de DuckDB (`row_number() OVER`,
 * `generate_series`, `COPY ... TO ... FORMAT PARQUET`) ejecutado contra el
 * MISMO motor que servía de almacén de trabajo — dejó de tener sentido al
 * mover la persistencia OLTP a Knex (SQLite/SQL Server, Fase 2 del plan de
 * migración a app web).
 *
 * Su reimplementación (leer las filas ya persistidas vía Knex y escribir
 * Parquet/CSV con DuckDB acotado exclusivamente a ese rol de motor de
 * escritura analítica) es trabajo de la Fase 5 — ver el plan aprobado. Este
 * stub mantiene la app funcionando end-to-end mientras tanto: no lanza, no
 * rompe el flujo normal de guardado (que sigue llamando
 * `solicitarRegeneracion()` igual que antes), simplemente no produce el
 * archivo todavía.
 */
export class ExportAnaliticoService implements IExportService {
  constructor(private readonly rutas: RutasDataLake) {}

  rutaExportacion(): string {
    return this.rutas.exportacion;
  }

  solicitarRegeneracion(): void {
    // No-op deliberado — ver el comentario de la clase.
  }

  async regenerar(): Promise<void> {
    // No-op deliberado — ver el comentario de la clase.
    await Promise.resolve();
  }
}
