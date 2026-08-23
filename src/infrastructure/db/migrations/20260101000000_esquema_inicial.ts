import type { Knex } from 'knex';

/**
 * Esquema inicial: recrea, tabla por tabla, el almacén de trabajo que antes
 * vivía en DuckDB (ver el `esquema.ts` retirado) más `usuarios`/`sesiones`
 * (autenticación, ver ServicioAutenticacion). Tipos deliberadamente
 * portables entre `better-sqlite3` (local/pruebas) y `mssql` (producción):
 *
 * - `.string(64)` solo para columnas tipo id/clave foránea corta (nunca se
 *   trunca un UUID de 36 caracteres ni ids sintéticos como "calc:xxx:periodo").
 * - `.text()` para todo lo demás (texto libre, JSON serializado, y también
 *   enums cortos como periodicidad/estado — sin costo real por no acotarlos).
 * - Restricciones UNIQUE reales solo sobre columnas acotadas: SQL Server no
 *   permite indexar una columna nvarchar(max)/`.text()` (límite de ~900-1700
 *   bytes por clave de índice). Donde la unicidad natural involucra una
 *   columna de texto libre (p. ej. `clave_desagregacion` en `resultados`),
 *   se aplica solo a nivel de aplicación vía el helper `upsert()`
 *   (verificar-existencia-then-insertar-o-actualizar, dentro de una
 *   transacción) — no como restricción de base de datos.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('indicadores', (t) => {
    t.string('id', 64).primary();
    t.text('codigo').notNullable().defaultTo('');
    t.text('nombre').notNullable();
    t.text('definicion').notNullable().defaultTo('');
    t.text('forma_calculo');
    t.text('periodicidad').notNullable();
    t.double('linea_base');
    t.string('linea_base_periodo_id', 64);
    t.double('meta_global');
    t.text('desagregaciones').notNullable().defaultTo('[]');
    t.text('estado').notNullable().defaultTo('Activo');
    t.string('responsable', 64);
    t.string('categoria', 64);
    t.text('unidad_medida');
    t.string('periodicidad_personalizada_id', 64);
    t.boolean('es_calculado').notNullable().defaultTo(false);
    t.text('formula');
    t.string('origen_automatico_id', 64);
    t.text('parametros_origen');
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('periodicidades_personalizadas', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.text('descripcion').notNullable().defaultTo('');
    t.text('cortes').notNullable().defaultTo('[]');
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('responsables', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.text('correo');
    t.boolean('activo').notNullable().defaultTo(true);
    t.boolean('eliminado').notNullable().defaultTo(false);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('categorias', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.text('descripcion').notNullable().defaultTo('');
    t.boolean('activo').notNullable().defaultTo(true);
    t.boolean('eliminado').notNullable().defaultTo(false);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('atributos', (t) => {
    t.string('id', 64).primary();
    t.text('entidad').notNullable();
    t.text('nombre').notNullable();
    t.text('descripcion').notNullable().defaultTo('');
    t.text('grupo').notNullable().defaultTo('General');
    t.integer('orden').notNullable().defaultTo(0);
    t.boolean('visible').notNullable().defaultTo(true);
    t.boolean('editable').notNullable().defaultTo(true);
    t.boolean('obligatorio').notNullable().defaultTo(false);
    t.text('valor_por_defecto');
    t.text('tipo_dato').notNullable();
    t.string('lista_id', 64);
    t.text('validaciones').notNullable().defaultTo('[]');
    t.text('condicion_visibilidad');
    t.text('condicion_obligatorio');
    t.boolean('filtrable').notNullable().defaultTo(false);
    t.boolean('activo').notNullable().defaultTo(true);
    t.boolean('eliminado').notNullable().defaultTo(false);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('origenes_automaticos', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.text('tipo').notNullable();
    t.text('descripcion').notNullable().defaultTo('');
    t.text('configuracion').notNullable().defaultTo('{}');
    t.text('parametros_generales').notNullable().defaultTo('[]');
    t.boolean('activo').notNullable().defaultTo(true);
    t.boolean('eliminado').notNullable().defaultTo(false);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('automatizaciones_indicador', (t) => {
    t.string('id', 64).primary();
    t.string('indicador_id', 64).notNullable().unique();
    t.string('origen_automatico_id', 64).notNullable();
    t.text('parametros_dinamicos').notNullable().defaultTo('[]');
    t.text('script').notNullable().defaultTo('');
    t.text('columna_valor');
    t.text('mapeo_columnas').notNullable().defaultTo('[]');
    t.text('desagregaciones_omitidas').notNullable().defaultTo('[]');
    t.text('medida_dax');
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('alias_desagregacion_origen', (t) => {
    t.string('id', 64).primary();
    t.string('lista_id', 64).notNullable();
    t.string('origen_automatico_id', 64).notNullable();
    t.text('alias').notNullable();
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
    t.unique(['lista_id', 'origen_automatico_id']);
  });

  await knex.schema.createTable('listas', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.text('descripcion').notNullable().defaultTo('');
    t.text('prefijo').notNullable().defaultTo('');
    t.text('estado').notNullable().defaultTo('Activa');
    t.integer('version').notNullable().defaultTo(1);
    t.integer('orden').notNullable().defaultTo(0);
    t.boolean('jerarquica').notNullable().defaultTo(false);
    t.boolean('eliminado').notNullable().defaultTo(false);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('elementos_lista', (t) => {
    t.string('id', 64).primary();
    t.string('lista_id', 64).notNullable();
    t.text('codigo').notNullable();
    t.text('nombre').notNullable().defaultTo('');
    t.text('descripcion').notNullable().defaultTo('');
    t.integer('orden').notNullable().defaultTo(0);
    t.text('padre_codigo');
    t.boolean('activo').notNullable().defaultTo(true);
    t.index(['lista_id']);
  });

  await knex.schema.createTable('metas', (t) => {
    t.string('id', 64).primary();
    t.string('indicador_id', 64).notNullable();
    t.text('clave_desagregacion').notNullable().defaultTo('GENERAL');
    t.double('valor').notNullable();
    t.text('periodicidad_medicion').notNullable();
    t.string('periodicidad_personalizada_id', 64);
    t.text('metodo_calculo').notNullable();
    t.integer('anio_vigencia').notNullable();
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
    t.index(['indicador_id']);
  });

  await knex.schema.createTable('reglas', (t) => {
    t.string('id', 64).primary();
    t.text('nombre').notNullable();
    t.text('descripcion').notNullable().defaultTo('');
    t.text('tipo').notNullable();
    t.text('entidad').notNullable();
    t.string('atributo_objetivo_id', 64);
    t.text('condicion').notNullable();
    t.text('mensaje_error');
    t.boolean('activa').notNullable().defaultTo(true);
    t.boolean('eliminado').notNullable().defaultTo(false);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('valores_atributos', (t) => {
    t.string('atributo_id', 64).notNullable();
    t.string('entidad_tipo', 64).notNullable();
    t.string('entidad_id', 64).notNullable();
    t.text('valor_texto');
    t.double('valor_numero');
    t.text('valor_fecha');
    t.boolean('valor_booleano');
    t.primary(['atributo_id', 'entidad_tipo', 'entidad_id']);
  });

  await knex.schema.createTable('resultados', (t) => {
    t.string('id', 64).primary();
    t.string('indicador_id', 64).notNullable();
    t.string('periodo_id', 64).notNullable();
    t.integer('anio').notNullable();
    // Sin UNIQUE de BD: incluye clave_desagregacion (texto libre, sin cota
    // segura para un índice en SQL Server). Unicidad aplicada a nivel de
    // aplicación por el helper upsert() — ver ResultadoRepositoryKnex.guardar.
    t.text('clave_desagregacion').notNullable();
    t.double('valor');
    t.text('observacion');
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
    t.index(['indicador_id', 'periodo_id']);
  });

  await knex.schema.createTable('levantamientos', (t) => {
    t.string('id', 64).primary();
    t.string('indicador_id', 64).notNullable();
    t.string('periodo_id', 64).notNullable();
    t.integer('anio').notNullable();
    t.text('fecha_corte');
    t.text('desagregaciones_excluidas').notNullable().defaultTo('[]');
    t.text('comentario');
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
    t.unique(['indicador_id', 'periodo_id']);
  });

  await knex.schema.createTable('auditoria', (t) => {
    t.string('id', 64).primary();
    t.text('usuario').notNullable();
    t.text('fecha_hora').notNullable();
    t.text('accion').notNullable();
    t.text('entidad').notNullable();
    t.string('entidad_id', 64).notNullable();
    t.text('campo');
    t.text('valor_anterior');
    t.text('valor_nuevo');
    t.index(['entidad', 'entidad_id']);
  });

  await knex.schema.createTable('resultados_historial', (t) => {
    t.string('id', 64).primary();
    t.string('indicador_id', 64).notNullable();
    t.string('periodo_id', 64).notNullable();
    t.text('clave_desagregacion').notNullable();
    t.integer('version').notNullable();
    t.double('valor');
    t.text('observacion');
    t.text('usuario').notNullable();
    t.text('actualizado_en').notNullable();
    t.index(['indicador_id', 'periodo_id']);
  });

  await knex.schema.createTable('adjuntos', (t) => {
    t.string('id', 64).primary();
    t.text('entidad').notNullable();
    t.string('entidad_id', 64).notNullable();
    t.text('nombre_archivo').notNullable();
    t.text('ruta_relativa').notNullable();
    t.integer('tamanio_bytes').notNullable();
    t.text('comentario');
    t.text('subido_en').notNullable();
    t.index(['entidad', 'entidad_id']);
  });

  // Autenticación (ver docs/plan de migración a app web — Fase 1/2).
  await knex.schema.createTable('usuarios', (t) => {
    t.string('id', 64).primary();
    t.string('nombre_usuario', 255).notNullable().unique();
    t.text('nombre_completo').notNullable().defaultTo('');
    t.text('password_hash').notNullable();
    t.string('rol', 32).notNullable().defaultTo('usuario');
    t.boolean('activo').notNullable().defaultTo(true);
    t.text('creado_en').notNullable();
    t.text('actualizado_en').notNullable();
  });

  await knex.schema.createTable('sesiones', (t) => {
    t.string('id', 64).primary();
    t.string('usuario_id', 64).notNullable();
    t.text('creado_en').notNullable();
    t.text('expira_en').notNullable();
    t.index(['usuario_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('sesiones');
  await knex.schema.dropTableIfExists('usuarios');
  await knex.schema.dropTableIfExists('adjuntos');
  await knex.schema.dropTableIfExists('resultados_historial');
  await knex.schema.dropTableIfExists('auditoria');
  await knex.schema.dropTableIfExists('levantamientos');
  await knex.schema.dropTableIfExists('resultados');
  await knex.schema.dropTableIfExists('valores_atributos');
  await knex.schema.dropTableIfExists('reglas');
  await knex.schema.dropTableIfExists('metas');
  await knex.schema.dropTableIfExists('elementos_lista');
  await knex.schema.dropTableIfExists('listas');
  await knex.schema.dropTableIfExists('alias_desagregacion_origen');
  await knex.schema.dropTableIfExists('automatizaciones_indicador');
  await knex.schema.dropTableIfExists('origenes_automaticos');
  await knex.schema.dropTableIfExists('atributos');
  await knex.schema.dropTableIfExists('categorias');
  await knex.schema.dropTableIfExists('responsables');
  await knex.schema.dropTableIfExists('periodicidades_personalizadas');
  await knex.schema.dropTableIfExists('indicadores');
}
