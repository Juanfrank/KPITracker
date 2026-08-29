import type { Knex } from 'knex';
import { ID_ROL_ADMINISTRADOR, ID_ROL_TECNICO, ID_ROL_USUARIO_ESTANDAR } from '@domain/index';

/**
 * Batch Y (pedido explícito del usuario):
 *
 * - Nuevos permisos POR DEFECTO de "Usuario estándar" (antes `[]`: ahora
 *   "ver indicadores" + "ver resultados") y "Técnico" (antes `[]`: ahora
 *   TODOS los permisos generales existentes, salvo `roles.administrar` —
 *   "todas las acciones excepto añadir roles"). Sobrescribe las filas
 *   semilla existentes sin condición (a diferencia de
 *   `20260930000000_roles_validador_tecnico.ts`, que solo insertaba si no
 *   existían): esto ES un cambio de default, no un "ensure exists".
 *
 * - Nuevo rol semilla general "Administrador" (`es_sistema=true`):
 *   funcionalmente equivalente al flag `Usuario.esAdministrador` para TODO
 *   chequeo de permisos (`ServicioPermisos.resolver` trata este id
 *   especialmente), pero a diferencia del flag, este SÍ es un rol asignable/
 *   quitable como cualquier otro — con una única excepción: al usuario que
 *   tiene `esAdministrador=true` no se le puede quitar ("al usuario admin no
 *   se le puede quitar este rol", pedido explícito), lo que esta migración
 *   arranca aquí mismo y `ServicioUsuarios.guardar` reafirma en cada guardado
 *   futuro.
 */
export async function up(knex: Knex): Promise<void> {
  const ahora = new Date().toISOString();

  await knex('roles')
    .where({ id: ID_ROL_USUARIO_ESTANDAR })
    .update({ permisos: JSON.stringify(['indicadores.ver.todos', 'resultados.ver.todos']), actualizado_en: ahora });

  const PERMISOS_GENERALES_SIN_ROLES = [
    'indicadores.ver.todos', 'resultados.ver.todos', 'resultados.registrar.todos', 'resultados.validar.todos',
    'auditoria.ver.todos', 'catalogos.administrar', 'respaldo.importarExportar', 'categorias.administrar',
    'equipos.administrar', 'origenes.administrar'
  ];
  await knex('roles')
    .where({ id: ID_ROL_TECNICO })
    .update({ permisos: JSON.stringify(PERMISOS_GENERALES_SIN_ROLES), actualizado_en: ahora });

  const yaExisteAdministrador = await knex('roles').where({ id: ID_ROL_ADMINISTRADOR }).first();
  if (!yaExisteAdministrador) {
    await knex('roles').insert({
      id: ID_ROL_ADMINISTRADOR,
      nombre: 'Administrador',
      ambito: 'general',
      // Lista informativa (todos los permisos generales, incluido `roles.administrar`) — el
      // acceso real de este rol NO depende de esta lista, ver el docstring de arriba.
      permisos: JSON.stringify([...PERMISOS_GENERALES_SIN_ROLES, 'roles.administrar']),
      es_sistema: true,
      creado_en: ahora,
      actualizado_en: ahora
    });
  }

  await knex('usuarios').where({ es_administrador: true }).update({ rol_general_id: ID_ROL_ADMINISTRADOR });
}

export async function down(knex: Knex): Promise<void> {
  await knex('roles').where({ id: ID_ROL_USUARIO_ESTANDAR }).update({ permisos: '[]' });
  await knex('roles').where({ id: ID_ROL_TECNICO }).update({ permisos: '[]' });
  await knex('roles').where({ id: ID_ROL_ADMINISTRADOR }).delete();
}
