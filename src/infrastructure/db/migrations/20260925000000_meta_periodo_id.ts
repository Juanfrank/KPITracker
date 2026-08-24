import type { Knex } from 'knex';

/**
 * "Configuración de Metas" (nuevo tab): permite fijar un valor de meta
 * DISTINTO para un período puntual (p. ej. Q1 ≠ Q2 ≠ Q3 ≠ Q4), no solo el
 * valor recurrente que hoy aplica por igual a todos los segmentos de su
 * periodicidad dentro del año. Aditiva, nullable — toda meta existente
 * sigue siendo recurrente (`periodo_id IS NULL`) exactamente como hoy; ver
 * `metaVigenteParaPeriodo` en el dominio para la resolución con prioridad
 * (override de período puntual > recurrente, en empate de especificidad).
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('metas', (t) => {
    t.string('periodo_id', 64);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('metas', (t) => {
    t.dropColumn('periodo_id');
  });
}
