import type { Knex } from 'knex';

/**
 * RBAC granular por categoría: tabla nueva `usuarios_permisos_categoria`,
 * paralela a `usuarios_permisos_excepcionales` (misma forma: usuario_id +
 * permiso) pero con una `categoria_id` adicional — un permiso de ámbito
 * `'categoria'` (ver `AmbitoPermiso` en `Permiso.ts`) solo aplica dentro de
 * ESA categoría concreta (y sus subcategorías, resuelto en runtime vía
 * `cadenaAncestros`, no en la base de datos). `.string(64)` para
 * `categoria_id`/`usuario_id` (ids cortos, mismo criterio que el resto del
 * esquema); `.string(128)` para `permiso`, igual que
 * `usuarios_permisos_excepcionales.permiso`. Índice compuesto
 * (usuario_id, categoria_id): la lectura típica es "todos los permisos de
 * categoría de este usuario" (sin filtrar por categoria_id) o "los permisos
 * de este usuario para ESTA categoría" — el índice sirve ambos casos porque
 * usuario_id es su columna líder.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('usuarios_permisos_categoria', (t) => {
    t.string('id', 64).primary();
    t.string('usuario_id', 64).notNullable();
    t.string('categoria_id', 64).notNullable();
    t.string('permiso', 128).notNullable();
    t.text('creado_en').notNullable();
    t.index(['usuario_id', 'categoria_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('usuarios_permisos_categoria');
}
