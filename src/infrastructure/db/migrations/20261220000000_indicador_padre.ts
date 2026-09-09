import type { Knex } from 'knex';

/**
 * Indicadores padre/hijo: `es_padre` marca un indicador cuyo resultado por
 * período se agrega a partir de los resultados YA ALMACENADOS de sus hijos
 * (ver `Indicador.esPadre` y `ServicioSeguimiento`/`ServicioRecoleccion`).
 * `indicadores_hijo` sigue el mismo tratamiento que `desagregaciones`
 * (arreglo de ids serializado como JSON en una columna de texto — ver
 * `mapeos.ts`). Aditiva, con defaults que preservan el comportamiento
 * actual: todo indicador existente queda `es_padre = false`, sin hijos ni
 * regla de agregación.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('indicadores', (t) => {
    t.boolean('es_padre').notNullable().defaultTo(false);
    t.text('indicadores_hijo').notNullable().defaultTo('[]');
    t.string('tipo_agregacion_padre').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('indicadores', (t) => {
    t.dropColumn('es_padre');
    t.dropColumn('indicadores_hijo');
    t.dropColumn('tipo_agregacion_padre');
  });
}
