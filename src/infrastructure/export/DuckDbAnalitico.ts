import { DuckDBInstance } from '@duckdb/node-api';
import type { DuckDBConnection } from '@duckdb/node-api';

/**
 * Instancia DuckDB de trabajo, en memoria, de vida corta — se crea una por
 * cada `regenerar()` de `ExportAnaliticoService` y se cierra al terminar.
 * Desde la Fase 2 del plan de migración a app web, DuckDB dejó de ser el
 * almacén OLTP de la aplicación (eso ahora es Knex/SQLite/SQL Server); su
 * único rol restante es motor de escritura Parquet/CSV para esta capa
 * analítica, acotado a esta clase — ver ExportAnaliticoService.
 */
export class DuckDbAnalitico {
  private constructor(
    private readonly instancia: DuckDBInstance,
    private readonly conexion: DuckDBConnection
  ) {}

  static async crear(): Promise<DuckDbAnalitico> {
    const instancia = await DuckDBInstance.create(':memory:');
    const conexion = await instancia.connect();
    return new DuckDbAnalitico(instancia, conexion);
  }

  async run(sql: string): Promise<void> {
    await this.conexion.run(sql);
  }

  cerrar(): void {
    this.conexion.closeSync();
    this.instancia.closeSync();
  }
}

function sq(v: string): string {
  return v.replace(/'/g, "''");
}

/** Literal SQL escapado para incrustar en un `VALUES (...)` — ver `escribirParquet`/`escribirCsv`. */
export function lit(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return `'${sq(String(v))}'`;
}

/**
 * Construye un `SELECT` a partir de filas planas ya resueltas en JS (columnas
 * fijas, mismo orden en cada fila) — el patrón que reemplaza a `SELECT * FROM
 * tabla` de la implementación original contra DuckDB embebido: los datos ya
 * no viven en DuckDB, así que se materializan aquí como literales `VALUES`
 * antes de pedirle a DuckDB que los escriba a disco.
 */
function construirConsultaValores(filas: ReadonlyArray<Record<string, unknown>>, columnas: readonly string[]): string {
  const nombresColumnas = columnas.map((c) => `"${c}"`).join(', ');
  if (filas.length === 0) {
    // Sin filas no hay de dónde inferir tipos — se declaran todas VARCHAR
    // (vacías) para que el archivo se genere igual, con el esquema de
    // columnas correcto aunque sin datos.
    return `SELECT ${columnas.map((c) => `NULL::VARCHAR AS "${c}"`).join(', ')} WHERE 1 = 0`;
  }
  const valores = filas.map((f) => `(${columnas.map((c) => lit(f[c])).join(', ')})`).join(', ');
  return `SELECT * FROM (VALUES ${valores}) AS t(${nombresColumnas})`;
}

export async function escribirParquet(
  db: DuckDbAnalitico,
  filas: ReadonlyArray<Record<string, unknown>>,
  columnas: readonly string[],
  rutaArchivo: string
): Promise<void> {
  const cuerpo = construirConsultaValores(filas, columnas);
  await db.run(`COPY (${cuerpo}) TO '${sq(rutaArchivo)}' (FORMAT PARQUET)`);
}

export async function escribirCsv(
  db: DuckDbAnalitico,
  filas: ReadonlyArray<Record<string, unknown>>,
  columnas: readonly string[],
  rutaArchivo: string
): Promise<void> {
  const cuerpo = construirConsultaValores(filas, columnas);
  await db.run(`COPY (${cuerpo}) TO '${sq(rutaArchivo)}' (FORMAT CSV, HEADER, DELIMITER ',')`);
}
