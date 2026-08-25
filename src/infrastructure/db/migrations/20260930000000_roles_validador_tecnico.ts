import type { Knex } from 'knex';
import { ID_ROL_COLABORADOR, ID_ROL_TECNICO, ID_ROL_VALIDADOR } from '@domain/index';

/**
 * Batch X (X6/X7): dos roles semilla nuevos, mismo criterio que los 4 de
 * `20260901000000_roles_permisos.ts` (ids fijos, `es_sistema=true` — no se
 * pueden borrar ni renombrar, pero sus permisos sí son editables).
 *
 * - Validador (ámbito equipo): "mismos permisos que Colaborador, además de
 *   validar resultados y ver auditoría" — pedido explícito del usuario.
 * - Técnico (ámbito general): "Rol de Sistema" — sin permisos por defecto,
 *   el administrador le concede las delegaciones puntuales que necesite
 *   (Administrar categorías/equipos/orígenes, Importar/exportar respaldos,
 *   Administrar roles) sin volverlo administrador completo.
 *
 * No hay cambio de esquema: `roles`/`permisos` ya son columnas genéricas
 * desde la migración de Batch T — este archivo solo inserta filas.
 */
export async function up(knex: Knex): Promise<void> {
  const ahora = new Date().toISOString();

  const yaExisteValidador = await knex('roles').where({ id: ID_ROL_VALIDADOR }).first();
  if (!yaExisteValidador) {
    const colaborador = await knex('roles').where({ id: ID_ROL_COLABORADOR }).first<{ permisos: string } | undefined>();
    const permisosColaborador: string[] = colaborador ? JSON.parse(colaborador.permisos) : ['resultados.ver.equipo', 'resultados.registrar.equipo'];
    const permisosValidador = [...new Set([...permisosColaborador, 'resultados.validar.equipo', 'auditoria.ver.equipo'])];

    await knex('roles').insert({
      id: ID_ROL_VALIDADOR, nombre: 'Validador', ambito: 'equipo',
      permisos: JSON.stringify(permisosValidador), es_sistema: true, creado_en: ahora, actualizado_en: ahora
    });
  }

  const yaExisteTecnico = await knex('roles').where({ id: ID_ROL_TECNICO }).first();
  if (!yaExisteTecnico) {
    await knex('roles').insert({
      id: ID_ROL_TECNICO, nombre: 'Técnico', ambito: 'general',
      permisos: '[]', es_sistema: true, creado_en: ahora, actualizado_en: ahora
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('roles').whereIn('id', [ID_ROL_VALIDADOR, ID_ROL_TECNICO]).delete();
}
