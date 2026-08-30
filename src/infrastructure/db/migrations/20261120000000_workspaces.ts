import type { Knex } from 'knex';
import {
  CATALOGO_PERMISOS_GLOBALES, ID_ROL_GLOBAL_SUPER_ADMINISTRADOR, ID_WORKSPACE_DEFAULT
} from '@domain/index';

/**
 * Batch AX — fundación para operar la app como SaaS multi-tenant (pedido
 * explícito del usuario): "el sistema de roles actual se transforma en
 * Workspace-específico, y se crea otro conjunto de Roles Globales que
 * puedan cambiar entre workspaces". Migración aditiva, mismo criterio que
 * todo el esquema (sin `.references()`/FK, la integridad referencial vive
 * en la capa de aplicación):
 *
 * - `workspaces`: nueva tabla, mismo shape que `categorias`/`equipos`
 *   (`ICatalogoRepository`). Se siembra un único Workspace por defecto
 *   (`ID_WORKSPACE_DEFAULT`) — TODO lo que existía antes de este batch
 *   "vive" ahí (ver el backfill abajo).
 * - `roles_globales`: nueva tabla, catálogo de `RolGlobal` (permisos de
 *   `CATALOGO_PERMISOS_GLOBALES`, sobre los Workspaces mismos, no sobre
 *   indicadores/resultados). Se siembra "Super administrador"
 *   (`es_sistema=true`) con TODOS los permisos del catálogo.
 * - `roles.workspace_id` (nueva columna): cada `Rol` (el catálogo ya
 *   existente de Batch T) pasa a pertenecer a un Workspace — backfillea a
 *   `ID_WORKSPACE_DEFAULT` para todo rol ya existente.
 * - `usuarios.rol_global_id`/`usuarios.workspace_actual_id` (nuevas
 *   columnas): todo usuario existente backfillea `workspace_actual_id =
 *   ID_WORKSPACE_DEFAULT`; quien ya tuviera `es_administrador=true` además
 *   recibe `rol_global_id = ID_ROL_GLOBAL_SUPER_ADMINISTRADOR` (mismo
 *   criterio que `20261010000000_rol_administrador.ts` retroactivamente le
 *   dio el rol "Administrador" a los admins existentes) — así el/los
 *   administrador(es) de una instalación ya migrada puede de inmediato
 *   crear otros Workspaces y cambiar entre ellos, sin un paso manual extra.
 *
 * Alcance DELIBERADAMENTE acotado (fundación, no una retro-adaptación
 * completa a multi-tenant real): ninguna otra tabla (indicadores,
 * categorías, equipos, resultados...) lleva `workspace_id` todavía — siguen
 * compartidas entre todos los Workspaces. Ampliar el aislamiento a esas
 * entidades queda fuera de este batch, ver el docstring de `Workspace.ts`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('workspaces', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.boolean('activo').notNullable().defaultTo(true);
    t.boolean('eliminado').notNullable().defaultTo(false);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('roles_globales', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.text('permisos').notNullable().defaultTo('[]');
    t.boolean('es_sistema').notNullable().defaultTo(false);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.alterTable('roles', (t) => {
    t.string('workspace_id', 64);
  });

  await knex.schema.alterTable('usuarios', (t) => {
    t.string('rol_global_id', 64);
    t.string('workspace_actual_id', 64);
  });

  // --- Semillas ---
  const ahora = new Date().toISOString();

  const yaExisteWorkspaceDefault = await knex('workspaces').where({ id: ID_WORKSPACE_DEFAULT }).first();
  if (!yaExisteWorkspaceDefault) {
    await knex('workspaces').insert({
      id: ID_WORKSPACE_DEFAULT, nombre: 'General', activo: true, eliminado: false, creado_en: ahora, actualizado_en: ahora
    });
  }

  const yaExisteSuperAdmin = await knex('roles_globales').where({ id: ID_ROL_GLOBAL_SUPER_ADMINISTRADOR }).first();
  if (!yaExisteSuperAdmin) {
    await knex('roles_globales').insert({
      id: ID_ROL_GLOBAL_SUPER_ADMINISTRADOR,
      nombre: 'Super administrador',
      permisos: JSON.stringify(CATALOGO_PERMISOS_GLOBALES.map((p) => p.id)),
      es_sistema: true,
      creado_en: ahora,
      actualizado_en: ahora
    });
  }

  // --- Backfill de datos existentes ---
  await knex('roles').whereNull('workspace_id').update({ workspace_id: ID_WORKSPACE_DEFAULT });
  await knex('usuarios').whereNull('workspace_actual_id').update({ workspace_actual_id: ID_WORKSPACE_DEFAULT });
  await knex('usuarios').where({ es_administrador: true }).update({ rol_global_id: ID_ROL_GLOBAL_SUPER_ADMINISTRADOR });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('usuarios', (t) => {
    t.dropColumn('rol_global_id');
    t.dropColumn('workspace_actual_id');
  });
  await knex.schema.alterTable('roles', (t) => {
    t.dropColumn('workspace_id');
  });
  await knex.schema.dropTableIfExists('roles_globales');
  await knex.schema.dropTableIfExists('workspaces');
}
