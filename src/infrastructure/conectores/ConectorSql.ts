import sql from 'mssql';
import type { IConectorOrigen, ResultadoPrueba, ResultadoTabular } from '@application/ports/index';
import type { OrigenAutomatico } from '@domain/index';

const TIEMPO_CONEXION_MS = 8000;
const TIEMPO_CONSULTA_MS = 30000;

function config(origen: OrigenAutomatico): sql.config {
  const c = origen.configuracion;
  return {
    server: c.servidor ?? '',
    port: c.puerto ? Number(c.puerto) : undefined,
    database: c.baseDatos || undefined,
    user: c.usuario || undefined,
    password: c.contrasena || undefined,
    options: { encrypt: true, trustServerCertificate: true },
    connectionTimeout: TIEMPO_CONEXION_MS,
    requestTimeout: TIEMPO_CONSULTA_MS
  };
}

/** Conector real para orígenes tipo SQL Server, vía el driver puro JS `mssql`/`tedious` (sin binarios nativos). */
export class ConectorSql implements Pick<IConectorOrigen, 'probar' | 'ejecutar'> {
  async probar(origen: OrigenAutomatico): Promise<ResultadoPrueba> {
    if (!origen.configuracion.servidor) return { ok: false, mensaje: 'Falta el servidor.' };
    let pool: sql.ConnectionPool | undefined;
    try {
      pool = await new sql.ConnectionPool(config(origen)).connect();
      await pool.request().query('SELECT 1 AS ok');
      return { ok: true, mensaje: 'Conexión exitosa.' };
    } catch (error) {
      return { ok: false, mensaje: `No se pudo conectar: ${(error as Error).message}` };
    } finally {
      await pool?.close().catch(() => undefined);
    }
  }

  async ejecutar(origen: OrigenAutomatico, script: string): Promise<ResultadoTabular> {
    let pool: sql.ConnectionPool | undefined;
    try {
      pool = await new sql.ConnectionPool(config(origen)).connect();
      const resultado = await pool.request().query(script);
      const filas = (resultado.recordset ?? []) as Record<string, unknown>[];
      const columnas = resultado.recordset?.columns ? Object.keys(resultado.recordset.columns) : (filas[0] ? Object.keys(filas[0]) : []);
      return {
        columnas,
        filas: filas.map((f) => Object.fromEntries(columnas.map((c) => [c, f[c] == null ? '' : String(f[c])])))
      };
    } finally {
      await pool?.close().catch(() => undefined);
    }
  }
}
