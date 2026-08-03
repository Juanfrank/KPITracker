import { DuckDBInstance } from '@duckdb/node-api';
import type { DuckDBConnection, DuckDBValue } from '@duckdb/node-api';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Envoltorio mínimo sobre DuckDB embebido. Es un detalle de infraestructura:
 * nada fuera de src/infrastructure debe importar este módulo.
 * Las operaciones se serializan en una cola para garantizar consistencia
 * (una única conexión de escritura).
 */
export class Db {
  private constructor(
    private readonly instancia: DuckDBInstance,
    private readonly conexion: DuckDBConnection
  ) {}

  private cola: Promise<unknown> = Promise.resolve();

  static async abrir(rutaArchivo: string): Promise<Db> {
    mkdirSync(dirname(rutaArchivo), { recursive: true });
    const instancia = await DuckDBInstance.create(rutaArchivo);
    const conexion = await instancia.connect();
    return new Db(instancia, conexion);
  }

  /** Encola una operación para serializar accesos concurrentes. */
  private encolar<T>(operacion: () => Promise<T>): Promise<T> {
    const resultado = this.cola.then(operacion, operacion);
    this.cola = resultado.catch(() => undefined);
    return resultado;
  }

  run(sql: string, valores?: unknown[]): Promise<void> {
    return this.encolar(async () => {
      await this.conexion.run(sql, valores as DuckDBValue[] | undefined);
    });
  }

  all<T = Record<string, unknown>>(sql: string, valores?: unknown[]): Promise<T[]> {
    return this.encolar(async () => {
      const reader = await this.conexion.runAndReadAll(sql, valores as DuckDBValue[] | undefined);
      return reader.getRowObjectsJS() as T[];
    });
  }

  async uno<T = Record<string, unknown>>(sql: string, valores?: unknown[]): Promise<T | null> {
    const filas = await this.all<T>(sql, valores);
    return filas[0] ?? null;
  }

  /** Ejecuta varias sentencias dentro de una transacción. */
  transaccion(operaciones: Array<{ sql: string; valores?: unknown[] }>): Promise<void> {
    return this.encolar(async () => {
      await this.conexion.run('BEGIN TRANSACTION');
      try {
        for (const op of operaciones) {
          await this.conexion.run(op.sql, op.valores as DuckDBValue[] | undefined);
        }
        await this.conexion.run('COMMIT');
      } catch (error) {
        await this.conexion.run('ROLLBACK');
        throw error;
      }
    });
  }

  cerrar(): void {
    this.conexion.closeSync();
    this.instancia.closeSync();
  }
}
