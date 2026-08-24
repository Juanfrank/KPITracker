import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';
import { ID_ROL_USUARIO_ESTANDAR } from '@domain/index';

const RONDAS_BCRYPT = 12;

/**
 * Batch U — unifica `Usuario` y el antiguo catálogo `Responsable`: ya no
 * existen como dos entidades vinculables 1 a 1, un `Usuario` ES la persona
 * asignable como responsable de un indicador (pedido explícito del
 * usuario: "Usuario and responsable are the same thing, no need to link
 * them together, unify them").
 *
 * Migración de datos (mismo `up()`, siguiendo la convención ya establecida):
 * - `usuarios` gana `correo`/`eliminado` (antes exclusivos de `Responsable`)
 *   y pierde `responsable_id`.
 * - Cada `Responsable` con un `Usuario` que lo vincula (`responsable_id`)
 *   fusiona sus campos (`correo`, `eliminado`) en esa fila de `usuarios`;
 *   `equipo_id` conserva el del `Usuario` si ya estaba seteado, si no toma
 *   el del `Responsable`.
 * - Cada `Responsable` SIN vínculo (huérfano) autocrea un `Usuario`: nombre
 *   de usuario generado a partir del nombre (único), rol general "Usuario
 *   estándar", contraseña aleatoria — el texto plano se guarda en
 *   `credenciales_generadas` para que el administrador lo vea UNA sola vez
 *   (`ServicioUsuarios.credencialesPendientes`, decisión confirmada con el
 *   usuario: "Auto-create accounts").
 * - `indicadores.responsable` (antes un id de `Responsable`) se reescribe
 *   al `Usuario.id` correspondiente.
 * - Se elimina la tabla `responsables`.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('credenciales_generadas', (t) => {
    t.string('usuario_id', 64).primary();
    t.text('password_texto').notNullable();
    t.text('creado_en').notNullable();
  });

  await knex.schema.alterTable('usuarios', (t) => {
    t.text('correo');
    t.boolean('eliminado').notNullable().defaultTo(false);
  });

  const ahora = new Date().toISOString();

  type FilaResponsable = { id: string; nombre: string; correo: string | null; activo: boolean | number; eliminado: boolean | number; equipo_id: string | null };
  type FilaUsuario = { id: string; nombre_usuario: string; equipo_id: string | null; responsable_id: string | null };

  const responsables: FilaResponsable[] = await knex('responsables').select('*');
  const usuarios: FilaUsuario[] = await knex('usuarios').select('id', 'nombre_usuario', 'equipo_id', 'responsable_id');
  const nombresUsuarioExistentes = new Set(usuarios.map((u) => u.nombre_usuario.toLowerCase()));

  const generarNombreUsuario = (nombre: string): string => {
    const base = nombre
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '') || 'usuario';
    let candidato = base;
    let sufijo = 1;
    while (nombresUsuarioExistentes.has(candidato)) {
      sufijo += 1;
      candidato = `${base}${sufijo}`;
    }
    nombresUsuarioExistentes.add(candidato);
    return candidato;
  };

  // responsableId (viejo) -> usuarioId (nuevo, ya sea el vinculado o el autocreado).
  const responsableAUsuario = new Map<string, string>();

  for (const responsable of responsables) {
    const vinculado = usuarios.find((u) => u.responsable_id === responsable.id);
    if (vinculado) {
      await knex('usuarios').where({ id: vinculado.id }).update({
        correo: responsable.correo,
        eliminado: Boolean(responsable.eliminado),
        equipo_id: vinculado.equipo_id ?? responsable.equipo_id
      });
      responsableAUsuario.set(responsable.id, vinculado.id);
      continue;
    }

    const nombreUsuario = generarNombreUsuario(responsable.nombre);
    const passwordTexto = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 16);
    const passwordHash = await bcrypt.hash(passwordTexto, RONDAS_BCRYPT);
    const nuevoId = `usuario-${responsable.id}`;

    await knex('usuarios').insert({
      id: nuevoId,
      nombre_usuario: nombreUsuario,
      nombre_completo: responsable.nombre,
      correo: responsable.correo,
      password_hash: passwordHash,
      es_administrador: false,
      rol_general_id: ID_ROL_USUARIO_ESTANDAR,
      equipo_id: responsable.equipo_id,
      rol_equipo_id: null,
      activo: Boolean(responsable.activo),
      eliminado: Boolean(responsable.eliminado),
      creado_en: ahora,
      actualizado_en: ahora
    });
    await knex('credenciales_generadas').insert({ usuario_id: nuevoId, password_texto: passwordTexto, creado_en: ahora });
    responsableAUsuario.set(responsable.id, nuevoId);
  }

  const indicadoresConResponsable: Array<{ id: string; responsable: string | null }> = await knex('indicadores')
    .select('id', 'responsable')
    .whereNotNull('responsable');
  for (const indicador of indicadoresConResponsable) {
    const nuevoResponsable = indicador.responsable ? responsableAUsuario.get(indicador.responsable) : undefined;
    if (nuevoResponsable) {
      await knex('indicadores').where({ id: indicador.id }).update({ responsable: nuevoResponsable });
    }
  }

  await knex.schema.alterTable('usuarios', (t) => {
    t.dropColumn('responsable_id');
  });
  await knex.schema.dropTableIfExists('responsables');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('usuarios', (t) => {
    t.string('responsable_id', 64);
  });

  await knex.schema.createTable('responsables', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.text('correo');
    t.boolean('activo').notNullable().defaultTo(true);
    t.boolean('eliminado').notNullable().defaultTo(false);
    t.string('equipo_id', 64);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  // Reconstrucción best-effort: un Usuario por cada indicador.responsable actual, sin
  // intentar deshacer la fusión/autocreación (irreversible por diseño, como el resto
  // de las migraciones de datos de esta app).
  const ahora = new Date().toISOString();
  const usuarios: Array<{ id: string; nombre_completo: string; correo: string | null; activo: boolean | number; eliminado: boolean | number; equipo_id: string | null }> =
    await knex('usuarios').select('id', 'nombre_completo', 'correo', 'activo', 'eliminado', 'equipo_id');
  for (const usuario of usuarios) {
    await knex('responsables').insert({
      id: usuario.id, nombre: usuario.nombre_completo, correo: usuario.correo,
      activo: Boolean(usuario.activo), eliminado: Boolean(usuario.eliminado), equipo_id: usuario.equipo_id,
      creado_en: ahora, actualizado_en: ahora
    });
  }

  await knex.schema.alterTable('usuarios', (t) => {
    t.dropColumn('correo');
    t.dropColumn('eliminado');
  });

  await knex.schema.dropTableIfExists('credenciales_generadas');
}
