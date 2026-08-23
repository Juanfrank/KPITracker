import { join } from 'node:path';
import KnexBuilder from 'knex';
import type { Knex } from 'knex';
import { FuenteMigracionesEnMemoria } from './migrations/index';

export interface OpcionesConexionDb {
  /** Directorio de datos del perfil activo — usado solo cuando DB_CLIENT es 'better-sqlite3' (o no está definido). */
  dataDir?: string;
}

function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre} (obligatoria con DB_CLIENT=mssql).`);
  return valor;
}

/**
 * Configuración de conexión por dialecto, seleccionada por la variable de
 * entorno `DB_CLIENT` — por defecto `better-sqlite3` (local, sin
 * instalación), o `mssql` apuntando a un servidor/base de datos reales
 * (variables `DB_SERVER`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`). El resto de la
 * aplicación (repositorios, casos de uso) no sabe cuál está activo — ambos
 * satisfacen el mismo esquema vía la misma migración (ver ./migrations).
 */
function config(opciones: OpcionesConexionDb): Knex.Config {
  const cliente = process.env.DB_CLIENT ?? 'better-sqlite3';
  if (cliente === 'mssql') {
    return {
      client: 'mssql',
      connection: {
        server: requerido('DB_SERVER'),
        database: requerido('DB_NAME'),
        user: requerido('DB_USER'),
        password: requerido('DB_PASSWORD'),
        options: {
          encrypt: (process.env.DB_ENCRYPT ?? 'true') !== 'false',
          trustServerCertificate: (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'false') === 'true'
        }
      },
      useNullAsDefault: true
    };
  }
  if (cliente !== 'better-sqlite3') {
    throw new Error(`DB_CLIENT="${cliente}" no soportado (use "better-sqlite3" o "mssql").`);
  }
  if (!opciones.dataDir) throw new Error('dataDir es obligatorio para el backend better-sqlite3.');
  return {
    client: 'better-sqlite3',
    connection: { filename: join(opciones.dataDir, 'kpitracker.sqlite') },
    useNullAsDefault: true
  };
}

/** Crea la instancia Knex y aplica las migraciones pendientes (crea el esquema desde cero si la base está vacía). */
export async function crearInstanciaKnex(opciones: OpcionesConexionDb = {}): Promise<Knex> {
  const knex = KnexBuilder(config(opciones));
  await knex.migrate.latest({ migrationSource: new FuenteMigracionesEnMemoria() });
  return knex;
}
