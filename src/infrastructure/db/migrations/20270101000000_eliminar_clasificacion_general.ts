import type { Knex } from 'knex';

// Mismos ids literales que sembraba `20260901000000_roles_permisos.ts` — ver el comentario ahí:
// ya no existen como constante del dominio, así que se repiten acá solo para poder ubicar/borrar
// esas dos filas puntuales y deshacer el backfill que apuntó a ellas.
const ID_CATEGORIA_GENERAL = 'categoria-general';
const ID_EQUIPO_GENERAL = 'equipo-general';

/**
 * Retira el respaldo automático a una categoría/equipo "General" (Batch T) —
 * pedido explícito del usuario: "trae más problemas que beneficios". Un
 * indicador sin Categoría/Equipo pasa a quedar genuinamente sin clasificar
 * (`categoria`/`equipo` en `null`), agrupado en Seguimiento bajo un bucket
 * "Sin categoría"/"Sin equipo" que NO es un catálogo real (ver
 * `SeguimientoPage.tsx`) en vez de forzarlo a esta fila fija.
 *
 * Deshace exactamente lo que sembró/backfilleó `20260901000000_roles_permisos.ts`:
 * - Vuelve a `null` cualquier `indicadores.categoria`/`indicadores.equipo` y
 *   `usuarios.equipo_id` que hoy apunten a los ids fijos "General" —
 *   indistinguible en este punto de una clasificación real a una categoría/
 *   equipo que alguien hubiera renombrado a "General" después, pero dado que
 *   el respaldo se aplicaba de forma transparente y silenciosa, no hay forma
 *   de distinguir ambos casos; se prioriza deshacer el efecto masivo del
 *   respaldo automático.
 * - Borra las dos filas "General" en sí (ya sin referencias tras el paso
 *   anterior) — no quedan como catálogo elegible.
 */
export async function up(knex: Knex): Promise<void> {
  await knex('indicadores').where({ categoria: ID_CATEGORIA_GENERAL }).update({ categoria: null });
  await knex('indicadores').where({ equipo: ID_EQUIPO_GENERAL }).update({ equipo: null });
  await knex('usuarios').where({ equipo_id: ID_EQUIPO_GENERAL }).update({ equipo_id: null });

  await knex('categorias').where({ id: ID_CATEGORIA_GENERAL }).delete();
  await knex('equipos').where({ id: ID_EQUIPO_GENERAL }).delete();
}

export async function down(knex: Knex): Promise<void> {
  const ahora = new Date().toISOString();
  const yaExisteCategoriaGeneral = await knex('categorias').where({ id: ID_CATEGORIA_GENERAL }).first();
  if (!yaExisteCategoriaGeneral) {
    await knex('categorias').insert({
      id: ID_CATEGORIA_GENERAL, nombre: 'General', descripcion: '', activo: true, eliminado: false,
      padre_id: null, prefijo: 'GEN', creado_en: ahora, actualizado_en: ahora
    });
  }
  const yaExisteEquipoGeneral = await knex('equipos').where({ id: ID_EQUIPO_GENERAL }).first();
  if (!yaExisteEquipoGeneral) {
    await knex('equipos').insert({
      id: ID_EQUIPO_GENERAL, nombre: 'General', descripcion: '', activo: true, eliminado: false,
      padre_id: null, creado_en: ahora, actualizado_en: ahora
    });
  }
  // No se restaura el backfill de `up()`: qué filas quedaron sin clasificar tras el `up()` de
  // esta migración (vs. las que ya venían así) no queda registrado en ningún lado.
}
