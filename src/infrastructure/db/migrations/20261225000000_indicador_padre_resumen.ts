import type { Knex } from 'knex';

/**
 * `Indicador.usarResultadoPropioEnResumenes` (pedido explícito del usuario):
 * solo relevante para un indicador padre — decide si Medición por
 * categoría/el subtotal de categoría-equipo en Seguimiento cuentan a este
 * indicador (su propio valor agregado) o a sus hijos directamente. Aditiva,
 * con `defaultTo(true)` — "se usa el resumen del padre", el comportamiento
 * por defecto pedido — así que todo indicador padre ya creado (Batch
 * anterior, sin esta columna) queda en el default correcto sin migrar datos.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('indicadores', (t) => {
    t.boolean('usar_resultado_propio_en_resumenes').notNullable().defaultTo(true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('indicadores', (t) => {
    t.dropColumn('usar_resultado_propio_en_resumenes');
  });
}
