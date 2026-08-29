import type { Knex } from 'knex';

/**
 * Batch Y — dos features nuevas, pedidas explícitamente por el usuario:
 * "Cortes de medición" (Configuración de Metas) y "medición por categoría"
 * (Administración → Categorías). Ambas tablas nuevas, aditivas, sin FKs
 * (mismo criterio que el resto del esquema — la integridad referencial vive
 * en la capa de aplicación).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('cortes_medicion', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.string('fecha', 10).notNullable();
    t.string('regla_general', 24).notNullable();
    t.text('reglas_por_indicador').notNullable().defaultTo('{}');
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  // 1:1 con `categorias.id` — sin fila = "sin configurar" (regla por defecto 'promedio', sin tratamientos).
  await knex.schema.createTable('configuracion_medicion_categoria', (t) => {
    t.string('categoria_id', 64).primary();
    t.string('regla_general', 24).notNullable().defaultTo('promedio');
    t.text('tratamiento_indicadores').notNullable().defaultTo('{}');
    t.text('actualizado_en').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('configuracion_medicion_categoria');
  await knex.schema.dropTableIfExists('cortes_medicion');
}
