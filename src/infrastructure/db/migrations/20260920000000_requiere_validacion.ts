import type { Knex } from 'knex';

/**
 * Batch U (U7) — nuevo atributo `Indicador.requiereValidacion`: si es
 * `false`, la UI de Recolección oculta la columna/los botones del flujo de
 * aprobación (Batch T5) para ese indicador. Aditiva, con `defaultTo(true)`
 * — todo indicador existente sigue requiriendo validación exactamente como
 * hoy, salvo que se desmarque explícitamente desde el formulario.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('indicadores', (t) => {
    t.boolean('requiere_validacion').notNullable().defaultTo(true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('indicadores', (t) => {
    t.dropColumn('requiere_validacion');
  });
}
