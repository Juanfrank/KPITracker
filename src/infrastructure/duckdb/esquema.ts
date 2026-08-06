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
    codigo VARCHAR NOT NULL DEFAULT '',
    nombre VARCHAR NOT NULL,
    definicion VARCHAR NOT NULL DEFAULT '',
    forma_calculo VARCHAR,
    periodicidad VARCHAR NOT NULL,
    linea_base DOUBLE,
    linea_base_periodo_id VARCHAR,
    meta_global DOUBLE,
    desagregaciones VARCHAR NOT NULL DEFAULT '[]',
    estado VARCHAR NOT NULL DEFAULT 'Activo',
    responsable VARCHAR,
    categoria VARCHAR,
    unidad_medida VARCHAR,
    periodicidad_personalizada_id VARCHAR,
    es_calculado BOOLEAN NOT NULL DEFAULT false,
    formula VARCHAR,
    origen_automatico_id VARCHAR,
    parametros_origen VARCHAR,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  periodicidades_personalizadas: `CREATE TABLE IF NOT EXISTS periodicidades_personalizadas (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR NOT NULL,
    descripcion VARCHAR NOT NULL DEFAULT '',
    cortes VARCHAR NOT NULL DEFAULT '[]',
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  responsables: `CREATE TABLE IF NOT EXISTS responsables (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR NOT NULL,
    correo VARCHAR,
    activo BOOLEAN NOT NULL DEFAULT true,
    eliminado BOOLEAN NOT NULL DEFAULT false,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  categorias: `CREATE TABLE IF NOT EXISTS categorias (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR NOT NULL,
    descripcion VARCHAR NOT NULL DEFAULT '',
    activo BOOLEAN NOT NULL DEFAULT true,
    eliminado BOOLEAN NOT NULL DEFAULT false,
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
    filtrable BOOLEAN NOT NULL DEFAULT false,
    activo BOOLEAN NOT NULL DEFAULT true,
    eliminado BOOLEAN NOT NULL DEFAULT false,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  origenes_automaticos: `CREATE TABLE IF NOT EXISTS origenes_automaticos (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR NOT NULL,
    tipo VARCHAR NOT NULL,
    descripcion VARCHAR NOT NULL DEFAULT '',
    configuracion VARCHAR NOT NULL DEFAULT '{}',
    parametros_generales VARCHAR NOT NULL DEFAULT '[]',
    activo BOOLEAN NOT NULL DEFAULT true,
    eliminado BOOLEAN NOT NULL DEFAULT false,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  automatizaciones_indicador: `CREATE TABLE IF NOT EXISTS automatizaciones_indicador (
    id VARCHAR PRIMARY KEY,
    indicador_id VARCHAR NOT NULL,
    origen_automatico_id VARCHAR NOT NULL,
    parametros_dinamicos VARCHAR NOT NULL DEFAULT '[]',
    script VARCHAR NOT NULL DEFAULT '',
    columna_valor VARCHAR,
    mapeo_columnas VARCHAR NOT NULL DEFAULT '[]',
    desagregaciones_omitidas VARCHAR NOT NULL DEFAULT '[]',
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL,
    UNIQUE (indicador_id)
  )`,
  alias_desagregacion_origen: `CREATE TABLE IF NOT EXISTS alias_desagregacion_origen (
    id VARCHAR PRIMARY KEY,
    lista_id VARCHAR NOT NULL,
    origen_automatico_id VARCHAR NOT NULL,
    alias VARCHAR NOT NULL,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL,
    UNIQUE (lista_id, origen_automatico_id)
  )`,
  listas: `CREATE TABLE IF NOT EXISTS listas (
    id VARCHAR PRIMARY KEY,
    nombre VARCHAR NOT NULL,
    descripcion VARCHAR NOT NULL DEFAULT '',
    prefijo VARCHAR NOT NULL DEFAULT '',
    estado VARCHAR NOT NULL DEFAULT 'Activa',
    version INTEGER NOT NULL DEFAULT 1,
    orden INTEGER NOT NULL DEFAULT 0,
    jerarquica BOOLEAN NOT NULL DEFAULT false,
    eliminado BOOLEAN NOT NULL DEFAULT false,
    creado_en VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  elementos_lista: `CREATE TABLE IF NOT EXISTS elementos_lista (
    id VARCHAR PRIMARY KEY,
    lista_id VARCHAR NOT NULL,
    codigo VARCHAR NOT NULL,
    nombre VARCHAR NOT NULL DEFAULT '',
    descripcion VARCHAR NOT NULL DEFAULT '',
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
    periodicidad_personalizada_id VARCHAR,
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
    eliminado BOOLEAN NOT NULL DEFAULT false,
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
    comentario VARCHAR,
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
  )`,
  resultados_historial: `CREATE TABLE IF NOT EXISTS resultados_historial (
    id VARCHAR PRIMARY KEY,
    indicador_id VARCHAR NOT NULL,
    periodo_id VARCHAR NOT NULL,
    clave_desagregacion VARCHAR NOT NULL,
    version INTEGER NOT NULL,
    valor DOUBLE,
    observacion VARCHAR,
    usuario VARCHAR NOT NULL,
    actualizado_en VARCHAR NOT NULL
  )`,
  adjuntos: `CREATE TABLE IF NOT EXISTS adjuntos (
    id VARCHAR PRIMARY KEY,
    entidad VARCHAR NOT NULL,
    entidad_id VARCHAR NOT NULL,
    nombre_archivo VARCHAR NOT NULL,
    ruta_relativa VARCHAR NOT NULL,
    tamanio_bytes INTEGER NOT NULL,
    comentario VARCHAR,
    subido_en VARCHAR NOT NULL
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
  periodicidades_personalizadas: 'Config/Periodicidades.parquet',
  responsables: 'Config/Responsables.parquet',
  categorias: 'Config/Categorias.parquet',
  origenes_automaticos: 'Config/OrigenesAutomaticos.parquet',
  automatizaciones_indicador: 'Config/AutomatizacionesIndicador.parquet',
  alias_desagregacion_origen: 'Config/AliasDesagregacionOrigen.parquet',
  valores_atributos: 'Facts/FactValoresAtributos.parquet',
  levantamientos: 'Facts/FactSeguimiento.parquet',
  auditoria: 'Logs/Auditoria.parquet',
  resultados_historial: 'Logs/ResultadosHistorial.parquet',
  adjuntos: 'Config/Adjuntos.parquet'
  // `resultados` se particiona por año: Facts/FactResultados/anio=YYYY/*.parquet
};

/**
 * Cambios de esquema aditivos sobre tablas ya existentes (una base de
 * trabajo creada por una versión anterior de la app). `CREATE TABLE IF NOT
 * EXISTS` no agrega columnas nuevas a una tabla preexistente; estas
 * sentencias sí, sin afectar los datos ya almacenados.
 */
// Nota: DuckDB no admite restricciones (NOT NULL) en `ALTER TABLE ADD COLUMN`
// ("Adding columns with constraints not yet supported"), a diferencia de
// `CREATE TABLE`. Las columnas agregadas aquí llevan DEFAULT pero sin NOT
// NULL; el valor por defecto de DuckDB ya cubre las filas preexistentes.
export const MIGRACIONES_ADITIVAS: string[] = [
  'ALTER TABLE indicadores ADD COLUMN IF NOT EXISTS periodicidad_personalizada_id VARCHAR',
  "ALTER TABLE indicadores ADD COLUMN IF NOT EXISTS codigo VARCHAR DEFAULT ''",
  'ALTER TABLE indicadores ADD COLUMN IF NOT EXISTS linea_base_periodo_id VARCHAR',
  'ALTER TABLE indicadores ADD COLUMN IF NOT EXISTS es_calculado BOOLEAN DEFAULT false',
  'ALTER TABLE indicadores ADD COLUMN IF NOT EXISTS formula VARCHAR',
  'ALTER TABLE indicadores ADD COLUMN IF NOT EXISTS forma_calculo VARCHAR',
  'ALTER TABLE indicadores ADD COLUMN IF NOT EXISTS origen_automatico_id VARCHAR',
  'ALTER TABLE indicadores ADD COLUMN IF NOT EXISTS parametros_origen VARCHAR',
  'ALTER TABLE atributos ADD COLUMN IF NOT EXISTS filtrable BOOLEAN DEFAULT false',
  "ALTER TABLE origenes_automaticos ADD COLUMN IF NOT EXISTS parametros_generales VARCHAR DEFAULT '[]'",
  'ALTER TABLE metas ADD COLUMN IF NOT EXISTS periodicidad_personalizada_id VARCHAR',
  "ALTER TABLE listas ADD COLUMN IF NOT EXISTS prefijo VARCHAR DEFAULT ''",
  "ALTER TABLE elementos_lista ADD COLUMN IF NOT EXISTS nombre VARCHAR DEFAULT ''",
  'ALTER TABLE levantamientos ADD COLUMN IF NOT EXISTS comentario VARCHAR',
  // El campo "Descripción" de un elemento funcionaba en realidad como su
  // nombre visible; al introducir `nombre` como campo separado, se
  // completa una sola vez desde el valor previo de `descripcion` para no
  // perder las etiquetas ya cargadas (idempotente: no hace nada una vez migrado).
  "UPDATE elementos_lista SET nombre = descripcion WHERE (nombre IS NULL OR nombre = '') AND descripcion IS NOT NULL AND descripcion != ''",
  // Borrado lógico (bloqueado por estar en uso), distinto del `activo`/`activa`/`estado`
  // que el usuario alterna manualmente — ver ServicioX.eliminar()/restaurar().
  'ALTER TABLE atributos ADD COLUMN IF NOT EXISTS eliminado BOOLEAN DEFAULT false',
  'ALTER TABLE listas ADD COLUMN IF NOT EXISTS eliminado BOOLEAN DEFAULT false',
  'ALTER TABLE reglas ADD COLUMN IF NOT EXISTS eliminado BOOLEAN DEFAULT false',
  'ALTER TABLE responsables ADD COLUMN IF NOT EXISTS eliminado BOOLEAN DEFAULT false',
  'ALTER TABLE categorias ADD COLUMN IF NOT EXISTS eliminado BOOLEAN DEFAULT false',
  'ALTER TABLE origenes_automaticos ADD COLUMN IF NOT EXISTS eliminado BOOLEAN DEFAULT false'
];

export async function crearEsquema(db: Db): Promise<void> {
  for (const sql of Object.values(TABLAS)) {
    await db.run(sql);
  }
  for (const sql of MIGRACIONES_ADITIVAS) {
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
      // BY NAME: tolera Parquet generados por una versión anterior con menos
      // columnas (p. ej. tras agregar periodicidad_personalizada_id); las
      // columnas nuevas quedan NULL en lugar de fallar por conteo de columnas.
      await db.run(`INSERT OR IGNORE INTO ${tabla} BY NAME SELECT * FROM read_parquet('${ruta.replace(/'/g, "''")}')`);
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
