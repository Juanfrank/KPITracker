import type { Knex } from 'knex';

/**
 * Categorías jerárquicas (categoría → subcategoría, cualquier profundidad,
 * vía `padre_id`) + prefijo visual; y el nuevo módulo de Equipos
 * (organización jerárquica, vinculada a indicadores directo o indirecto vía
 * el responsable) — ver plan Batch R. Migración aditiva sobre el esquema
 * inicial (`20260101000000_esquema_inicial.ts`), no la modifica: mismo
 * criterio de todo el esquema, sin `.references()`/FK — la integridad
 * referencial de `padre_id`/`equipo_id`/`equipo` vive en la capa de
 * aplicación (`sinCiclo`, verificación de referencias antes de borrar).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('equipos', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.text('descripcion').notNullable().defaultTo('');
    t.boolean('activo').notNullable().defaultTo(true);
    t.boolean('eliminado').notNullable().defaultTo(false);
    t.string('padre_id', 64);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.alterTable('categorias', (t) => {
    t.string('padre_id', 64);
    t.text('prefijo');
  });

  await knex.schema.alterTable('responsables', (t) => {
    t.string('equipo_id', 64);
  });

  await knex.schema.alterTable('indicadores', (t) => {
    t.string('equipo', 64);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('indicadores', (t) => {
    t.dropColumn('equipo');
  });
  await knex.schema.alterTable('responsables', (t) => {
    t.dropColumn('equipo_id');
  });
  await knex.schema.alterTable('categorias', (t) => {
    t.dropColumn('padre_id');
    t.dropColumn('prefijo');
  });
  await knex.schema.dropTableIfExists('equipos');
}
