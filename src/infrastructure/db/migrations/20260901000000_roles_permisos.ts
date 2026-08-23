import type { Knex } from 'knex';
import {
  ID_CATEGORIA_GENERAL, ID_EQUIPO_GENERAL, ID_ROL_COLABORADOR, ID_ROL_LIDER_EQUIPO, ID_ROL_USUARIO_ESTANDAR, ID_ROL_VISOR
} from '@domain/index';

/**
 * Batch T — clasificación obligatoria (T1/T2, sin cambios de esquema: las
 * columnas ya existen desde Batch R), Responsable↔Usuario 1 a 1, y el
 * sistema de roles/permisos configurable (T3) + flujo de aprobación de
 * resultados (T5). Migración aditiva sobre el esquema existente, mismo
 * criterio de todo el esquema: sin `.references()`/FK, la integridad
 * referencial vive en la capa de aplicación.
 *
 * Reemplaza `usuarios.rol` ('admin'|'usuario') por `es_administrador` +
 * `rol_general_id`/`equipo_id`/`rol_equipo_id` — migración de datos incluida
 * en este mismo `up()`: siembra los 4 roles semilla (`Usuario estándar`,
 * `Líder de equipo`, `Colaborador`, `Visor`, ver `Rol.ts`) y traduce cada
 * usuario existente antes de borrar la columna vieja.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('roles', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.string('ambito', 16).notNullable();
    t.text('permisos').notNullable().defaultTo('[]');
    t.boolean('es_sistema').notNullable().defaultTo(false);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('usuarios_permisos_excepcionales', (t) => {
    t.string('id', 64).primary();
    t.string('usuario_id', 64).notNullable();
    t.string('permiso', 128).notNullable();
    t.text('creado_en').notNullable();
    t.index(['usuario_id']);
  });

  await knex.schema.alterTable('usuarios', (t) => {
    t.boolean('es_administrador').notNullable().defaultTo(false);
    t.string('rol_general_id', 64);
    t.string('equipo_id', 64);
    t.string('rol_equipo_id', 64);
    t.string('responsable_id', 64);
  });

  await knex.schema.alterTable('resultados', (t) => {
    t.string('estado_validacion', 16).notNullable().defaultTo('Pendiente');
    t.string('validado_por', 64);
    t.text('validado_en');
    t.text('comentario_validacion');
  });

  // --- Migración de datos: roles semilla + traducción de usuarios.rol ---
  // Ids FIJOS (no randomUUID) para los 4 roles semilla — igual criterio que
  // ID_CATEGORIA_GENERAL/ID_EQUIPO_GENERAL (Catalogos.ts): un respaldo
  // exportado de una instalación e importado en otra (RespaldoPerfilService,
  // upsert por id) debe actualizar estos MISMOS roles, no crear 4 duplicados
  // con nombre repetido y otro id aleatorio.
  const ahora = new Date().toISOString();
  const idColaborador = ID_ROL_COLABORADOR;
  const idVisor = ID_ROL_VISOR;
  const idLider = ID_ROL_LIDER_EQUIPO;
  const idUsuarioEstandar = ID_ROL_USUARIO_ESTANDAR;

  const permisosColaborador = ['resultados.ver.equipo', 'resultados.registrar.equipo'];
  const permisosVisor = ['resultados.ver.equipo'];
  const permisosLider = [
    ...permisosColaborador,
    'resultados.validar.equipo',
    'equipo.miembros.gestionar',
    'equipo.indicadores.asignar',
    'auditoria.ver.equipo'
  ];

  await knex('roles').insert([
    { id: idUsuarioEstandar, nombre: 'Usuario estándar', ambito: 'general', permisos: '[]', es_sistema: true, creado_en: ahora, actualizado_en: ahora },
    { id: idColaborador, nombre: 'Colaborador', ambito: 'equipo', permisos: JSON.stringify(permisosColaborador), es_sistema: true, creado_en: ahora, actualizado_en: ahora },
    { id: idVisor, nombre: 'Visor', ambito: 'equipo', permisos: JSON.stringify(permisosVisor), es_sistema: true, creado_en: ahora, actualizado_en: ahora },
    { id: idLider, nombre: 'Líder de equipo', ambito: 'equipo', permisos: JSON.stringify(permisosLider), es_sistema: true, creado_en: ahora, actualizado_en: ahora }
  ]);

  const usuariosExistentes: Array<{ id: string; rol: string }> = await knex('usuarios').select('id', 'rol');
  for (const u of usuariosExistentes) {
    const esAdmin = u.rol === 'admin';
    await knex('usuarios')
      .where({ id: u.id })
      .update({ es_administrador: esAdmin, rol_general_id: esAdmin ? null : idUsuarioEstandar });
  }

  await knex.schema.alterTable('usuarios', (t) => {
    t.dropColumn('rol');
  });

  // --- T1/T2: categoría/equipo "General" (ids fijos, ver ID_CATEGORIA_GENERAL/ID_EQUIPO_GENERAL
  // en Catalogos.ts) + backfill de clasificación faltante en filas ya existentes. ---
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

  await knex('indicadores').whereNull('categoria').update({ categoria: ID_CATEGORIA_GENERAL });
  await knex('indicadores').whereNull('equipo').whereNull('responsable').update({ equipo: ID_EQUIPO_GENERAL });
  await knex('responsables').whereNull('equipo_id').update({ equipo_id: ID_EQUIPO_GENERAL });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('usuarios', (t) => {
    t.string('rol', 32).notNullable().defaultTo('usuario');
  });
  const usuarios: Array<{ id: string; es_administrador: boolean | number }> = await knex('usuarios').select('id', 'es_administrador');
  for (const u of usuarios) {
    await knex('usuarios').where({ id: u.id }).update({ rol: u.es_administrador ? 'admin' : 'usuario' });
  }

  await knex.schema.alterTable('resultados', (t) => {
    t.dropColumn('estado_validacion');
    t.dropColumn('validado_por');
    t.dropColumn('validado_en');
    t.dropColumn('comentario_validacion');
  });

  await knex.schema.alterTable('usuarios', (t) => {
    t.dropColumn('es_administrador');
    t.dropColumn('rol_general_id');
    t.dropColumn('equipo_id');
    t.dropColumn('rol_equipo_id');
    t.dropColumn('responsable_id');
  });

  await knex.schema.dropTableIfExists('usuarios_permisos_excepcionales');
  await knex.schema.dropTableIfExists('roles');
}
