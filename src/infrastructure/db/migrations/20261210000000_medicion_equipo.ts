import type { Knex } from 'knex';

/**
 * Batch BB (pedido explícito del usuario): la misma configuración de
 * "resumen" que ya tenían las categorías (Batch Y7) — y que ya tenía Cortes
 * (`acotarAl100`, Batch AA) — gana un toggle `acotar_al_100` propio,
 * encendido por defecto ("más entendible": cada resultado PARTICIPANTE de
 * la agregación se acota a 100 antes de combinarse, ver docstring de
 * `ConfiguracionMedicionCategoria.acotarAl100`). Además, los EQUIPOS ganan
 * la misma configuración por primera vez — antes un equipo/sub-equipo
 * SIEMPRE usaba promedio simple sin excepciones (ver `AT4` en
 * `medicionToggles.spec.ts`, ahora obsoleto).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('configuracion_medicion_categoria', (t) => {
    t.boolean('acotar_al_100').notNullable().defaultTo(true);
  });

  // Mismo shape que `configuracion_medicion_categoria` — 1:1 con `equipos.id` (sin FK, mismo
  // criterio que el resto del esquema); sin fila = "sin configurar" (promedio, sin excepciones,
  // acotado — mismos defaults que una categoría recién creada).
  await knex.schema.createTable('configuracion_medicion_equipo', (t) => {
    t.string('equipo_id', 64).primary();
    t.string('regla_general', 24).notNullable().defaultTo('promedio');
    t.text('tratamiento_indicadores').notNullable().defaultTo('{}');
    t.boolean('acotar_al_100').notNullable().defaultTo(true);
    t.text('actualizado_en').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('configuracion_medicion_equipo');
  await knex.schema.alterTable('configuracion_medicion_categoria', (t) => {
    t.dropColumn('acotar_al_100');
  });
}
