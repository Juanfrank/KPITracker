import type { Db } from './Db';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Esquema del almacén de trabajo DuckDB. Cada tabla se materializa a
 * Parquet en /Data (ver RutasDataLake); las condiciones y listas complejas
 * se guardan como JSON en columnas de texto.
 */
const TABLAS: Record<string, string> = {
  indicadores: `CREATE TABLE IF NOT EXISTS indicadores (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR NOT NULL,
    definicion VARCHAR NOT NULL DEFAULT '',
    periodicidad VARCHAR NOT NULL,
    linea_base DOUBLE,
    meta_global DOUBLE,
    desagregaciones VARCHAR NOT NULL DEFAULT '[]',
    estado VARCHAR NOT NULL DEFAULT 'Activo',
    responsable VARCHAR,
    categoria VARCHAR,
    unidad_medida VARCHAR,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  atributos: `CREATE TABLE IF NOT EXISTS atributos (
    id VARCHAR PRIMARY KEY,
    entidad VARCHAR NOT NULL,
    nombre VARCHAR NOT NULL,
    descripcion VARCHAR NOT NULL DEFAULT '',
    grupo VARCHAR NOT NULL DEFAULT 'General',
    orden INTEGER NOT NULL DEFAULT 0,
    visible BOOLEAN NOT NULL DEFAULT true,
    editable BOOLEAN NOT NULL DEFAULT true,
    obligatorio BOOLEAN NOT NULL DEFAULT false,
    valor_por_defecto VARCHAR,
    tipo_dato VARCHAR NOT NULL,
    lista_id VARCHAR,
    validaciones VARCHAR NOT NULL DEFAULT '[]',
    condicion_visibilidad VARCHAR,
    condicion_obligatorio VARCHAR,
    activo BOOLEAN NOT NULL DEFAULT true,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  listas: `CREATE TABLE IF NOT EXISTS listas (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR NOT NULL,
    descripcion VARCHAR NOT NULL DEFAULT '',
    estado VARCHAR NOT NULL DEFAULT 'Activa',
    version INTEGER NOT NULL DEFAULT 1,
    orden INTEGER NOT NULL DEFAULT 0,
    jerarquica BOOLEAN NOT NULL DEFAULT false,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  elementos_lista: `CREATE TABLE IF NOT EXISTS elementos_lista (
    id VARCHAR PRIMARY KEY,
    lista_id VARCHAR NOT NULL,
    codigo VARCHAR NOT NULL,
    descripcion VARCHAR NOT NULL,
    orden INTEGER NOT NULL DEFAULT 0,
    padre_codigo VARCHAR,
    activo BOOLEAN NOT NULL DEFAULT true
  )`,
  metas: `CREATE TABLE IF NOT EXISTS metas (
    id VARCHAR PRIMARY KEY,
    indicador_id VARCHAR NOT NULL,
    clave_desagregacion VARCHAR NOT NULL DEFAULT 'GENERAL',
    valor DOUBLE NOT NULL,
    periodicidad_medicion VARCHAR NOT NULL,
    metodo_calculo VARCHAR NOT NULL,
    anio_vigencia INTEGER NOT NULL,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  reglas: `CREATE TABLE IF NOT EXISTS reglas (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR NOT NULL,
    descripcion VARCHAR NOT NULL DEFAULT '',
    tipo VARCHAR NOT NULL,
    entidad VARCHAR NOT NULL,
    atributo_objetivo_id VARCHAR,
    condicion VARCHAR NOT NULL,
    mensaje_error VARCHAR,
    activa BOOLEAN NOT NULL DEFAULT true,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  valores_atributos: `CREATE TABLE IF NOT EXISTS valores_atributos (
    atributo_id VARCHAR NOT NULL,
    entidad_tipo VARCHAR NOT NULL,
    entidad_id VARCHAR NOT NULL,
    valor_texto VARCHAR,
    valor_numero DOUBLE,
    valor_fecha VARCHAR,
    valor_booleano BOOLEAN,
    PRIMARY KEY (atributo_id, entidad_tipo, entidad_id)
  )`,
  resultados: `CREATE TABLE IF NOT EXISTS resultados (
    id VARCHAR PRIMARY KEY,
    indicador_id VARCHAR NOT NULL,
    periodo_id VARCHAR NOT NULL,
    anio INTEGER NOT NULL,
    clave_desagregacion VARCHAR NOT NULL,
    valor DOUBLE,
    observacion VARCHAR,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL,
    UNIQUE (indicador_id, periodo_id, clave_desagregacion)
  )`,
  levantamientos: `CREATE TABLE IF NOT EXISTS levantamientos (
    id VARCHAR PRIMARY KEY,
    indicador_id VARCHAR NOT NULL,
    periodo_id VARCHAR NOT NULL,
    anio INTEGER NOT NULL,
    fecha_corte VARCHAR,
    desagregaciones_excluidas VARCHAR NOT NULL DEFAULT '[]',
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL,
    UNIQUE (indicador_id, periodo_id)
  )`,
  auditoria: `CREATE TABLE IF NOT EXISTS auditoria (
    id VARCHAR PRIMARY KEY,
    usuario VARCHAR NOT NULL,
    fecha_hora VARCHAR NOT NULL,
    accion VARCHAR NOT NULL,
    entidad VARCHAR NOT NULL,
    entidad_id VARCHAR NOT NULL,
    campo VARCHAR,
    valor_anterior VARCHAR,
    valor_nuevo VARCHAR
  )`
};

/** Mapa tabla -> ruta Parquet relativa dentro de /Data (organización física). */
export const PARQUET_POR_TABLA: Record<string, string> = {
  indicadores: 'Config/Indicadores.parquet',
  atributos: 'Config/Atributos.parquet',
  listas: 'Config/Listas.parquet',
  elementos_lista: 'Config/ElementosLista.parquet',
  metas: 'Config/Metas.parquet',
  reglas: 'Config/Reglas.parquet',
  valores_atributos: 'Facts/FactValoresAtributos.parquet',
  levantamientos: 'Facts/FactSeguimiento.parquet',
  auditoria: 'Logs/Auditoria.parquet'
  // `resultados` se particiona por año: Facts/FactResultados/anio=YYYY/*.parquet
};

export async function crearEsquema(db: Db): Promise<void> {
  for (const sql of Object.values(TABLAS)) {
    await db.run(sql);
  }
}

/**
 * Si la base de trabajo está vacía pero existen Parquet previos (p. ej. la
 * app se reinstaló conservando /Data), restaura las tablas desde Parquet.
 * Parquet es el formato persistente canónico.
 */
export async function restaurarDesdeParquetSiVacio(db: Db, dataDir: string): Promise<void> {
  const fila = await db.uno<{ n: number }>('SELECT COUNT(*)::INT AS n FROM indicadores');
  if ((fila?.n ?? 0) > 0) return;

  for (const [tabla, rel] of Object.entries(PARQUET_POR_TABLA)) {
    const ruta = join(dataDir, rel);
    if (existsSync(ruta)) {
      await db.run(`INSERT OR IGNORE INTO ${tabla} SELECT * FROM read_parquet('${ruta.replace(/'/g, "''")}')`);
    }
  }
  const dirResultados = join(dataDir, 'Facts', 'FactResultados');
  if (existsSync(dirResultados)) {
    const patron = join(dirResultados, '**', '*.parquet').replace(/'/g, "''");
    await db.run(
      `INSERT OR IGNORE INTO resultados
       SELECT id, indicador_id, periodo_id, anio, clave_desagregacion, valor, observacion, creado_en, actualizado_en
       FROM read_parquet('${patron}', hive_partitioning = true)`
    );
  }
}
