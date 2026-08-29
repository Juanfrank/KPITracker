import type { Knex } from 'knex';

/**
 * Batch AA (pedido explícito del usuario): "Cortes de medición" deja de
 * definirse por una fecha puntual — pasa a ser una PERIODICIDAD recurrente
 * superior al mes (Bimestral..Anual). Además gana dos toggles, encendidos
 * por defecto: "Omitir períodos sin meta" y "Acotar resultado al 100%".
 *
 * Los cortes existentes (creados por fecha en Batch Y/Z) no tienen un
 * mapeo automático razonable de "una fecha puntual" a "una periodicidad
 * recurrente" — se backfillean a 'Trimestral' como default sensato; quien
 * los haya configurado deberá revisarlos tras esta migración (documentado,
 * no silencioso).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cortes_medicion', (t) => {
    t.string('periodicidad', 24).notNullable().defaultTo('Trimestral');
    t.boolean('omitir_periodos_sin_meta').notNullable().defaultTo(true);
    t.boolean('acotar_al_100').notNullable().defaultTo(true);
  });
  await knex.schema.alterTable('cortes_medicion', (t) => {
    t.dropColumn('fecha');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('cortes_medicion', (t) => {
    t.string('fecha', 10).notNullable().defaultTo('');
  });
  await knex.schema.alterTable('cortes_medicion', (t) => {
    t.dropColumn('periodicidad');
    t.dropColumn('omitir_periodos_sin_meta');
    t.dropColumn('acotar_al_100');
  });
}
