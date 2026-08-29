import type { Knex } from 'knex';

/**
 * Batch AV (pedido explícito del usuario): marca interna de CÓMO se obtuvo
 * el valor VIGENTE de un `Resultado` — 'Automatico' cuando vino de
 * `ServicioRecoleccion.obtenerResultadoAutomatico` (un origen automático
 * configurado), 'Manual' en cualquier otro caso (captura a mano, pegado
 * desde Excel, o una restauración de versión — todas acciones deliberadas
 * de una persona). Junto con `capturado_por`/`capturado_en` documenta el
 * "quién y cuándo" del valor actual — deliberadamente DISTINTO de
 * `actualizado_en`, que también se toca al validar/rechazar (Batch T) y por
 * eso no sirve para saber cuándo se CAPTURÓ el dato.
 *
 * Filas existentes: no hay forma de reconstruir si su valor vigente vino de
 * un origen automático o de captura manual — se backfillean a 'Manual'
 * (el caso más común y el que no sobre-afirma automatización que no se
 * puede verificar) con `capturado_en = actualizado_en` como mejor
 * aproximación disponible; documentado acá, no silencioso.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('resultados', (t) => {
    t.string('origen_captura', 16).notNullable().defaultTo('Manual');
    t.string('capturado_por', 64);
    t.text('capturado_en');
  });
  await knex('resultados').update({ capturado_en: knex.ref('actualizado_en') });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('resultados', (t) => {
    t.dropColumn('origen_captura');
    t.dropColumn('capturado_por');
    t.dropColumn('capturado_en');
  });
}
