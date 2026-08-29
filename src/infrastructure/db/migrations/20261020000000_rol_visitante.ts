import type { Knex } from 'knex';
import { ID_ROL_VISITANTE } from '@domain/index';

/**
 * Batch Z (pedido explícito del usuario): nuevo rol general semilla
 * "Visitante" — sin ningún permiso ("sin permisos para nada"). Se convierte
 * en el nuevo default que `ServicioUsuarios.rolGeneralPorDefecto()` asigna a
 * todo usuario creado sin rol explícito, reemplazando a "Usuario estándar"
 * en ese rol de "default" — "Usuario estándar" sigue existiendo tal cual
 * (con sus permisos de ver, Batch Y), solo deja de ser el que se asigna
 * automáticamente.
 */
export async function up(knex: Knex): Promise<void> {
  const yaExiste = await knex('roles').where({ id: ID_ROL_VISITANTE }).first();
  if (yaExiste) return;
  const ahora = new Date().toISOString();
  await knex('roles').insert({
    id: ID_ROL_VISITANTE,
    nombre: 'Visitante',
    ambito: 'general',
    permisos: '[]',
    es_sistema: true,
    creado_en: ahora,
    actualizado_en: ahora
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex('roles').where({ id: ID_ROL_VISITANTE }).delete();
}
