import type { Knex } from 'knex';

/**
 * "¿Existe esta clave? Actualízala; si no, créala" — dentro de una
 * transacción, para que sea atómico frente a escrituras concurrentes
 * ("última en comprometerse gana", determinístico — ver
 * tests/unit/application/ServicioAutenticacion.test.ts para el mismo
 * patrón probado bajo concurrencia real).
 *
 * Reemplaza deliberadamente a `INSERT OR REPLACE`/`ON CONFLICT ... DO
 * UPDATE` (sintaxis DuckDB/SQLite que SQL Server no tiene — necesitaría
 * `MERGE`) con una única implementación agnóstica de dialecto: es la misma
 * semántica de "reemplazar por clave" que usaban esos ~13 sitios en la era
 * DuckDB, solo que expresada con el query builder en vez de SQL crudo. El
 * costo de un SELECT extra por escritura es irrelevante a la escala de esta
 * app (un solo espacio de trabajo compartido, no alto throughput).
 */
export async function upsert(
  knex: Knex,
  tabla: string,
  filtroUnico: Record<string, unknown>,
  valores: Record<string, unknown>
): Promise<void> {
  await knex.transaction(async (trx) => {
    const existe = await trx(tabla).where(filtroUnico).first();
    if (existe) {
      await trx(tabla).where(filtroUnico).update(valores);
    } else {
      await trx(tabla).insert({ ...filtroUnico, ...valores });
    }
  });
}
