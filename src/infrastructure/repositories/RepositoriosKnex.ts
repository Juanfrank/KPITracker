import type { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { compararRoles } from '@domain/index';
import type {
  Adjunto, AliasDesagregacionOrigen, Atributo, AutomatizacionIndicador, ConfiguracionMedicionCategoria,
  CorteMedicion, DefinicionPeriodicidad, ElementoLista, EntidadAdjunto, Equipo, Indicador, Levantamiento, Lista,
  Meta, OrigenAutomatico, RegistroAuditoria, ReglaNegocio, Resultado, ResultadoHistorial, Rol, RolGlobal, Sesion,
  Usuario
} from '@domain/index';
import type {
  FiltroAuditoria, IAdjuntoRepository, IAliasDesagregacionOrigenRepository, IAtributoRepository,
  IAuditoriaRepository, IAutomatizacionIndicadorRepository, ICatalogoRepository, ICorteMedicionRepository,
  ICredencialGeneradaRepository, IIndicadorRepository, IListaRepository, IMedicionCategoriaRepository,
  IMetaRepository, IPermisoCategoriaRepository, IPermisoExcepcionalRepository, IReglaRepository,
  IResultadoRepository, IRolGlobalRepository, IRolRepository, ISesionRepository, IUsuarioRepository,
  PermisoCategoria, ResumenPeriodo, ValorAtributoEntidad
} from '@application/ports/index';
import { upsert } from '../db/upsert';
import {
  aAdjunto, aAliasDesagregacionOrigen, aAtributo, aAuditoria, aAutomatizacionIndicador, aCorteMedicion,
  aDefinicionPeriodicidad, aElemento, aEquipo, aIndicador, aLevantamiento, aLista, aMedicionCategoria, aMeta,
  aOrigenAutomatico, aRegla, aResultado, aResultadoHistorial, aRol, aRolGlobal, aSesion, aUsuario,
  deAdjunto, deAliasDesagregacionOrigen, deAtributo, deAuditoria, deAutomatizacionIndicador, deCorteMedicion,
  deDefinicionPeriodicidad, deElemento, deEquipo, deIndicador, deLevantamiento, deLista, deMedicionCategoria, deMeta,
  deOrigenAutomatico, deRegla, deResultado, deResultadoHistorial, deRol, deRolGlobal, deSesion, deUsuario
} from './mapeos';

/**
 * Implementaciones Knex (better-sqlite3 local / mssql producción) de los
 * puertos de persistencia — reemplazan a las implementaciones DuckDB de la
 * era de escritorio offline-first. Cada `guardar()` que antes era `INSERT OR
 * REPLACE`/`ON CONFLICT ... DO UPDATE` (sintaxis que SQL Server no tiene) usa
 * ahora el helper `upsert()`, agnóstico de dialecto.
 */

abstract class RepositorioBase {
  constructor(protected readonly knex: Knex) {}
}

/**
 * Filtro NULL-safe para excluir ítems con borrado lógico: `eliminado` puede
 * venir en NULL en filas de una base migrada desde una versión anterior sin
 * la columna — deben tratarse como "no eliminado". Se expresa como callback
 * de Knex (portable) en vez de un fragmento de SQL crudo.
 */
function noEliminado(builder: Knex.QueryBuilder): Knex.QueryBuilder {
  return builder.where((q) => q.where('eliminado', false).orWhereNull('eliminado'));
}

function aValorAtributoEntidad(f: Record<string, unknown>): ValorAtributoEntidad {
  return {
    atributoId: String(f.atributo_id),
    entidadTipo: String(f.entidad_tipo),
    entidadId: String(f.entidad_id),
    valorTexto: f.valor_texto == null ? null : String(f.valor_texto),
    valorNumero: f.valor_numero == null ? null : Number(f.valor_numero),
    valorFecha: f.valor_fecha == null ? null : String(f.valor_fecha),
    valorBooleano: f.valor_booleano == null ? null : Boolean(f.valor_booleano)
  };
}

export class IndicadorRepositoryKnex extends RepositorioBase implements IIndicadorRepository {
  async listar(): Promise<Indicador[]> {
    return (await this.knex('indicadores').select('*').orderBy('nombre')).map(aIndicador);
  }

  async obtener(id: string): Promise<Indicador | null> {
    const fila = await this.knex('indicadores').where({ id }).first();
    return fila ? aIndicador(fila) : null;
  }

  async buscarPorCodigo(codigo: string, excluirId?: string): Promise<Indicador | null> {
    const consulta = this.knex('indicadores').where({ codigo });
    if (excluirId) consulta.andWhereNot({ id: excluirId });
    const fila = await consulta.first();
    return fila ? aIndicador(fila) : null;
  }

  async guardar(indicador: Indicador): Promise<void> {
    await upsert(this.knex, 'indicadores', { id: indicador.id }, deIndicador(indicador));
  }

  async eliminar(id: string): Promise<void> {
    await this.knex('indicadores').where({ id }).delete();
  }
}

export class AtributoRepositoryKnex extends RepositorioBase implements IAtributoRepository {
  async listar(entidad?: string, incluirEliminados = false): Promise<Atributo[]> {
    let consulta = this.knex('atributos').select('*');
    if (entidad) consulta = consulta.where({ entidad });
    if (!incluirEliminados) consulta = noEliminado(consulta);
    return (await consulta.orderBy(['grupo', 'orden'])).map(aAtributo);
  }

  async obtener(id: string): Promise<Atributo | null> {
    const fila = await this.knex('atributos').where({ id }).first();
    return fila ? aAtributo(fila) : null;
  }

  async guardar(atributo: Atributo): Promise<void> {
    await upsert(this.knex, 'atributos', { id: atributo.id }, deAtributo(atributo));
  }

  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    // Sin cascada: los valores capturados (`valores_atributos`) se conservan
    // intactos para poder restaurar el atributo sin perder datos históricos.
    await this.knex('atributos').where({ id }).update({ eliminado, activo: !eliminado, actualizado_en: new Date().toISOString() });
  }

  async obtenerValores(entidadTipo: string, entidadId: string): Promise<ValorAtributoEntidad[]> {
    const filas = await this.knex('valores_atributos').where({ entidad_tipo: entidadTipo, entidad_id: entidadId });
    return filas.map(aValorAtributoEntidad);
  }

  async listarEntidadesConValor(atributoId: string): Promise<ValorAtributoEntidad[]> {
    const filas = await this.knex('valores_atributos').where({ atributo_id: atributoId });
    return filas.map(aValorAtributoEntidad);
  }

  async guardarValor(valor: ValorAtributoEntidad): Promise<void> {
    await upsert(
      this.knex, 'valores_atributos',
      { atributo_id: valor.atributoId, entidad_tipo: valor.entidadTipo, entidad_id: valor.entidadId },
      { valor_texto: valor.valorTexto, valor_numero: valor.valorNumero, valor_fecha: valor.valorFecha, valor_booleano: valor.valorBooleano }
    );
  }
}

export class ListaRepositoryKnex extends RepositorioBase implements IListaRepository {
  async listar(incluirEliminados = false): Promise<Lista[]> {
    let consulta = this.knex('listas').select('*');
    if (!incluirEliminados) consulta = noEliminado(consulta);
    return (await consulta.orderBy(['orden', 'nombre'])).map(aLista);
  }

  async obtener(id: string): Promise<Lista | null> {
    const fila = await this.knex('listas').where({ id }).first();
    return fila ? aLista(fila) : null;
  }

  async guardar(lista: Lista): Promise<void> {
    await upsert(this.knex, 'listas', { id: lista.id }, deLista(lista));
  }

  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    // Sin cascada: los elementos de la lista se conservan intactos para
    // poder restaurar la lista sin perder datos.
    await this.knex('listas').where({ id }).update({ eliminado, estado: eliminado ? 'Inactiva' : 'Activa', actualizado_en: new Date().toISOString() });
  }

  async listarElementos(listaId: string): Promise<ElementoLista[]> {
    const filas = await this.knex('elementos_lista').where({ lista_id: listaId }).orderBy(['orden', 'codigo']);
    return filas.map(aElemento);
  }

  async guardarElemento(elemento: ElementoLista): Promise<void> {
    await upsert(this.knex, 'elementos_lista', { id: elemento.id }, deElemento(elemento));
  }

  async eliminarElemento(id: string): Promise<void> {
    await this.knex('elementos_lista').where({ id }).delete();
  }
}

export class MetaRepositoryKnex extends RepositorioBase implements IMetaRepository {
  async listarPorIndicador(indicadorId: string): Promise<Meta[]> {
    const filas = await this.knex('metas').where({ indicador_id: indicadorId }).orderBy(['anio_vigencia', 'clave_desagregacion']);
    return filas.map(aMeta);
  }

  async guardar(meta: Meta): Promise<void> {
    await upsert(this.knex, 'metas', { id: meta.id }, deMeta(meta));
  }

  async eliminar(id: string): Promise<void> {
    await this.knex('metas').where({ id }).delete();
  }
}

export class ReglaRepositoryKnex extends RepositorioBase implements IReglaRepository {
  async listar(entidad?: string, incluirEliminados = false): Promise<ReglaNegocio[]> {
    let consulta = this.knex('reglas').select('*');
    if (entidad) consulta = consulta.where({ entidad });
    if (!incluirEliminados) consulta = noEliminado(consulta);
    return (await consulta.orderBy('nombre')).map(aRegla);
  }

  async obtener(id: string): Promise<ReglaNegocio | null> {
    const fila = await this.knex('reglas').where({ id }).first();
    return fila ? aRegla(fila) : null;
  }

  async guardar(regla: ReglaNegocio): Promise<void> {
    await upsert(this.knex, 'reglas', { id: regla.id }, deRegla(regla));
  }

  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    await this.knex('reglas').where({ id }).update({ eliminado, activa: !eliminado, actualizado_en: new Date().toISOString() });
  }
}

export class ResultadoRepositoryKnex extends RepositorioBase implements IResultadoRepository {
  async obtenerPorIndicadorPeriodo(indicadorId: string, periodoId: string): Promise<Resultado[]> {
    const filas = await this.knex('resultados')
      .where({ indicador_id: indicadorId, periodo_id: periodoId })
      .orderBy('clave_desagregacion');
    return filas.map(aResultado);
  }

  async listarTodos(): Promise<Resultado[]> {
    const filas = await this.knex('resultados').orderBy(['indicador_id', 'periodo_id', 'clave_desagregacion']);
    return filas.map(aResultado);
  }

  async guardar(resultado: Resultado): Promise<void> {
    // Clave natural (indicador, período, desagregación) — sin UNIQUE de BD
    // (ver migración inicial), la unicidad la garantiza este upsert transaccional.
    await upsert(
      this.knex, 'resultados',
      { indicador_id: resultado.indicadorId, periodo_id: resultado.periodoId, clave_desagregacion: resultado.claveDesagregacion },
      deResultado(resultado)
    );
  }

  async obtenerLevantamiento(indicadorId: string, periodoId: string): Promise<Levantamiento | null> {
    const fila = await this.knex('levantamientos').where({ indicador_id: indicadorId, periodo_id: periodoId }).first();
    return fila ? aLevantamiento(fila) : null;
  }

  async listarLevantamientos(indicadorId?: string): Promise<Levantamiento[]> {
    const consulta = this.knex('levantamientos').select('*');
    if (indicadorId) consulta.where({ indicador_id: indicadorId });
    return (await consulta).map(aLevantamiento);
  }

  async guardarLevantamiento(levantamiento: Levantamiento): Promise<void> {
    await upsert(
      this.knex, 'levantamientos',
      { indicador_id: levantamiento.indicadorId, periodo_id: levantamiento.periodoId },
      deLevantamiento(levantamiento)
    );
  }

  async resumenPorIndicador(indicadorId: string): Promise<ResumenPeriodo[]> {
    return this.resumen({ indicador_id: indicadorId });
  }

  async resumenGlobal(): Promise<ResumenPeriodo[]> {
    return this.resumen({});
  }

  private async resumen(filtro: Record<string, unknown>): Promise<ResumenPeriodo[]> {
    // SUM(CASE WHEN...) en vez de COUNT(...) FILTER (WHERE...)::INT (DuckDB/Postgres):
    // portable en better-sqlite3 y mssql sin necesidad de CAST.
    const consulta = this.knex('resultados')
      .where(filtro)
      .groupBy(['indicador_id', 'periodo_id'])
      .select('indicador_id', 'periodo_id')
      .select(this.knex.raw('SUM(CASE WHEN valor IS NOT NULL THEN 1 ELSE 0 END) as con_valor'))
      .max('actualizado_en as ultima');
    const filas = await consulta;
    return filas.map((f) => ({
      indicadorId: String(f.indicador_id),
      periodoId: String(f.periodo_id),
      combinacionesConValor: Number(f.con_valor),
      ultimaActualizacion: f.ultima == null ? null : String(f.ultima)
    }));
  }

  async resultadosGeneralPorIndicador(indicadorId: string): Promise<Array<{ periodoId: string; valor: number | null }>> {
    const filas = await this.knex('resultados')
      .where({ indicador_id: indicadorId, clave_desagregacion: 'GENERAL' })
      .select('periodo_id', 'valor');
    return filas.map((f) => ({ periodoId: String(f.periodo_id), valor: f.valor == null ? null : Number(f.valor) }));
  }

  async obtenerHistorial(indicadorId: string, periodoId: string, claveDesagregacion: string): Promise<ResultadoHistorial[]> {
    const filas = await this.knex('resultados_historial')
      .where({ indicador_id: indicadorId, periodo_id: periodoId, clave_desagregacion: claveDesagregacion })
      .orderBy('version', 'desc');
    return filas.map(aResultadoHistorial);
  }

  async registrarVersion(entrada: ResultadoHistorial): Promise<void> {
    await this.knex('resultados_historial').insert(deResultadoHistorial(entrada));
  }
}

export class AuditoriaRepositoryKnex extends RepositorioBase implements IAuditoriaRepository {
  async registrar(registro: RegistroAuditoria): Promise<void> {
    await this.knex('auditoria').insert(deAuditoria(registro));
  }

  async consultar(filtro: FiltroAuditoria): Promise<RegistroAuditoria[]> {
    let consulta = this.knex('auditoria').select('*');
    if (filtro.entidad) consulta = consulta.where({ entidad: filtro.entidad });
    if (filtro.entidadId) consulta = consulta.where({ entidad_id: filtro.entidadId });
    if (filtro.desde) consulta = consulta.where('fecha_hora', '>=', filtro.desde);
    if (filtro.hasta) consulta = consulta.where('fecha_hora', '<=', filtro.hasta);
    const limite = Math.min(filtro.limite ?? 500, 5000);
    const filas = await consulta.orderBy('fecha_hora', 'desc').limit(limite);
    return filas.map(aAuditoria);
  }
}

/**
 * Repositorio genérico de catálogo (id, nombre, ...): usado tanto para
 * DefinicionPeriodicidad como para Categoria/Equipo/OrigenAutomatico.
 * `tabla` y los mapeadores se fijan en el composition root; nunca provienen
 * de entrada de usuario.
 */
export class CatalogoRepositoryKnex<T extends { readonly id: string }> extends RepositorioBase implements ICatalogoRepository<T> {
  constructor(
    knex: Knex,
    private readonly tabla: string,
    private readonly aEntidad: (fila: Record<string, unknown>) => T,
    private readonly deEntidad: (item: T) => Record<string, unknown>,
    /**
     * `true` para tablas que tienen la columna `eliminado` (borrado lógico
     * bloqueado por uso): `responsables`, `categorias`, `origenes_automaticos`.
     * `periodicidades_personalizadas` queda en `false` (sigue con hard-delete
     * vía `eliminar`).
     */
    private readonly soportaEliminado: boolean = false
  ) {
    super(knex);
  }

  async listar(incluirEliminados = false): Promise<T[]> {
    let consulta = this.knex(this.tabla).select('*');
    if (this.soportaEliminado && !incluirEliminados) consulta = noEliminado(consulta);
    return (await consulta.orderBy('nombre')).map(this.aEntidad);
  }

  async obtener(id: string): Promise<T | null> {
    const fila = await this.knex(this.tabla).where({ id }).first();
    return fila ? this.aEntidad(fila) : null;
  }

  async guardar(item: T): Promise<void> {
    await upsert(this.knex, this.tabla, { id: item.id }, this.deEntidad(item));
  }

  /** Hard-delete: solo lo usa `periodicidades_personalizadas` (`soportaEliminado: false`). */
  async eliminar(id: string): Promise<void> {
    await this.knex(this.tabla).where({ id }).delete();
  }

  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    if (!this.soportaEliminado) throw new Error(`La tabla "${this.tabla}" no soporta borrado lógico.`);
    await this.knex(this.tabla).where({ id }).update({ eliminado, activo: !eliminado, actualizado_en: new Date().toISOString() });
  }
}

export class AdjuntoRepositoryKnex extends RepositorioBase implements IAdjuntoRepository {
  async listarPorEntidad(entidad: EntidadAdjunto, entidadId: string): Promise<Adjunto[]> {
    const filas = await this.knex('adjuntos').where({ entidad, entidad_id: entidadId }).orderBy('subido_en', 'desc');
    return filas.map(aAdjunto);
  }

  async obtener(id: string): Promise<Adjunto | null> {
    const fila = await this.knex('adjuntos').where({ id }).first();
    return fila ? aAdjunto(fila) : null;
  }

  async guardar(adjunto: Adjunto): Promise<void> {
    await upsert(this.knex, 'adjuntos', { id: adjunto.id }, deAdjunto(adjunto));
  }

  async eliminar(id: string): Promise<void> {
    await this.knex('adjuntos').where({ id }).delete();
  }
}

export class AutomatizacionIndicadorRepositoryKnex extends RepositorioBase implements IAutomatizacionIndicadorRepository {
  async obtenerPorIndicador(indicadorId: string): Promise<AutomatizacionIndicador | null> {
    const fila = await this.knex('automatizaciones_indicador').where({ indicador_id: indicadorId }).first();
    return fila ? aAutomatizacionIndicador(fila) : null;
  }

  async listarTodas(): Promise<AutomatizacionIndicador[]> {
    return (await this.knex('automatizaciones_indicador').select('*').orderBy('indicador_id')).map(aAutomatizacionIndicador);
  }

  async guardar(config: AutomatizacionIndicador): Promise<void> {
    await upsert(this.knex, 'automatizaciones_indicador', { indicador_id: config.indicadorId }, deAutomatizacionIndicador(config));
  }

  async eliminar(indicadorId: string): Promise<void> {
    await this.knex('automatizaciones_indicador').where({ indicador_id: indicadorId }).delete();
  }
}

export class AliasDesagregacionOrigenRepositoryKnex extends RepositorioBase implements IAliasDesagregacionOrigenRepository {
  async listarPorLista(listaId: string): Promise<AliasDesagregacionOrigen[]> {
    const filas = await this.knex('alias_desagregacion_origen').where({ lista_id: listaId }).orderBy('alias');
    return filas.map(aAliasDesagregacionOrigen);
  }

  async listarPorOrigen(origenAutomaticoId: string): Promise<AliasDesagregacionOrigen[]> {
    const filas = await this.knex('alias_desagregacion_origen').where({ origen_automatico_id: origenAutomaticoId }).orderBy('alias');
    return filas.map(aAliasDesagregacionOrigen);
  }

  async listarTodos(): Promise<AliasDesagregacionOrigen[]> {
    return (await this.knex('alias_desagregacion_origen').select('*').orderBy('alias')).map(aAliasDesagregacionOrigen);
  }

  async obtener(listaId: string, origenAutomaticoId: string): Promise<AliasDesagregacionOrigen | null> {
    const fila = await this.knex('alias_desagregacion_origen').where({ lista_id: listaId, origen_automatico_id: origenAutomaticoId }).first();
    return fila ? aAliasDesagregacionOrigen(fila) : null;
  }

  async guardar(alias: AliasDesagregacionOrigen): Promise<void> {
    await upsert(this.knex, 'alias_desagregacion_origen', { lista_id: alias.listaId, origen_automatico_id: alias.origenAutomaticoId }, deAliasDesagregacionOrigen(alias));
  }

  async eliminar(id: string): Promise<void> {
    await this.knex('alias_desagregacion_origen').where({ id }).delete();
  }
}

export class UsuarioRepositoryKnex extends RepositorioBase implements IUsuarioRepository {
  async listar(incluirEliminados = false): Promise<Usuario[]> {
    let consulta = this.knex('usuarios').select('*');
    if (!incluirEliminados) consulta = consulta.where({ eliminado: false });
    return (await consulta.orderBy('nombre_usuario')).map(aUsuario);
  }

  async obtener(id: string): Promise<Usuario | null> {
    const fila = await this.knex('usuarios').where({ id }).first();
    return fila ? aUsuario(fila) : null;
  }

  async obtenerPorNombreUsuario(nombreUsuario: string): Promise<Usuario | null> {
    const fila = await this.knex('usuarios').where({ nombre_usuario: nombreUsuario }).first();
    return fila ? aUsuario(fila) : null;
  }

  async guardar(usuario: Usuario): Promise<void> {
    await upsert(this.knex, 'usuarios', { id: usuario.id }, deUsuario(usuario));
  }

  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    await this.knex('usuarios').where({ id }).update({ eliminado });
  }
}

/** Credenciales temporales generadas automáticamente (Batch U) — ver docstring de `ICredencialGeneradaRepository`. */
export class CredencialGeneradaRepositoryKnex extends RepositorioBase implements ICredencialGeneradaRepository {
  async registrar(usuarioId: string, passwordTexto: string): Promise<void> {
    await upsert(this.knex, 'credenciales_generadas', { usuario_id: usuarioId }, { password_texto: passwordTexto, creado_en: new Date().toISOString() });
  }

  async consumirTodas(): Promise<Array<{ usuarioId: string; nombreUsuario: string; passwordTexto: string }>> {
    const filas: Array<{ usuario_id: string; nombre_usuario: string; password_texto: string }> = await this.knex('credenciales_generadas')
      .join('usuarios', 'usuarios.id', 'credenciales_generadas.usuario_id')
      .select('credenciales_generadas.usuario_id', 'usuarios.nombre_usuario', 'credenciales_generadas.password_texto');
    await this.knex('credenciales_generadas').del();
    return filas.map((f) => ({ usuarioId: f.usuario_id, nombreUsuario: f.nombre_usuario, passwordTexto: f.password_texto }));
  }

  async existePendiente(usuarioId: string): Promise<boolean> {
    const fila = await this.knex('credenciales_generadas').where({ usuario_id: usuarioId }).first();
    return fila != null;
  }

  async limpiarPendiente(usuarioId: string): Promise<void> {
    await this.knex('credenciales_generadas').where({ usuario_id: usuarioId }).del();
  }
}

export class RolRepositoryKnex extends RepositorioBase implements IRolRepository {
  async listar(workspaceId: string): Promise<Rol[]> {
    // Orden por ámbito, luego `compararRoles` (Batch Y: orden fijo de los roles semilla,
    // no alfabético — un ORDER BY de SQL no puede expresar ese orden explícito). Batch AX:
    // filtrado por Workspace — cada uno tiene su propio catálogo de roles.
    const filas = (await this.knex('roles').select('*').where({ workspace_id: workspaceId }).orderBy('ambito')).map(aRol);
    return filas.sort((a, b) => (a.ambito === b.ambito ? compararRoles(a, b) : a.ambito.localeCompare(b.ambito)));
  }

  async obtener(id: string): Promise<Rol | null> {
    const fila = await this.knex('roles').where({ id }).first();
    return fila ? aRol(fila) : null;
  }

  async guardar(rol: Rol): Promise<void> {
    await upsert(this.knex, 'roles', { id: rol.id }, deRol(rol));
  }

  async eliminar(id: string): Promise<void> {
    await this.knex('roles').where({ id }).delete();
  }
}

/** Catálogo de roles GLOBALES (Batch AX) — sin partición por Workspace, orden semilla-primero + alfabético. */
export class RolGlobalRepositoryKnex extends RepositorioBase implements IRolGlobalRepository {
  async listar(): Promise<RolGlobal[]> {
    const filas = await this.knex('roles_globales').select('*').orderBy([{ column: 'es_sistema', order: 'desc' }, { column: 'nombre', order: 'asc' }]);
    return filas.map(aRolGlobal);
  }

  async obtener(id: string): Promise<RolGlobal | null> {
    const fila = await this.knex('roles_globales').where({ id }).first();
    return fila ? aRolGlobal(fila) : null;
  }

  async guardar(rol: RolGlobal): Promise<void> {
    await upsert(this.knex, 'roles_globales', { id: rol.id }, deRolGlobal(rol));
  }

  async eliminar(id: string): Promise<void> {
    await this.knex('roles_globales').where({ id }).delete();
  }
}

export class CorteMedicionRepositoryKnex extends RepositorioBase implements ICorteMedicionRepository {
  async listar(): Promise<CorteMedicion[]> {
    return (await this.knex('cortes_medicion').select('*').orderBy('nombre')).map(aCorteMedicion);
  }

  async obtener(id: string): Promise<CorteMedicion | null> {
    const fila = await this.knex('cortes_medicion').where({ id }).first();
    return fila ? aCorteMedicion(fila) : null;
  }

  async guardar(corte: CorteMedicion): Promise<void> {
    await upsert(this.knex, 'cortes_medicion', { id: corte.id }, deCorteMedicion(corte));
  }

  async eliminar(id: string): Promise<void> {
    await this.knex('cortes_medicion').where({ id }).delete();
  }
}

export class MedicionCategoriaRepositoryKnex extends RepositorioBase implements IMedicionCategoriaRepository {
  async obtener(categoriaId: string): Promise<ConfiguracionMedicionCategoria | null> {
    const fila = await this.knex('configuracion_medicion_categoria').where({ categoria_id: categoriaId }).first();
    return fila ? aMedicionCategoria(fila) : null;
  }

  async listar(): Promise<ConfiguracionMedicionCategoria[]> {
    return (await this.knex('configuracion_medicion_categoria').select('*')).map(aMedicionCategoria);
  }

  async guardar(config: ConfiguracionMedicionCategoria): Promise<void> {
    await upsert(this.knex, 'configuracion_medicion_categoria', { categoria_id: config.categoriaId }, deMedicionCategoria(config));
  }
}

export class PermisoExcepcionalRepositoryKnex extends RepositorioBase implements IPermisoExcepcionalRepository {
  async listarPorUsuario(usuarioId: string): Promise<string[]> {
    const filas = await this.knex('usuarios_permisos_excepcionales').where({ usuario_id: usuarioId }).select('permiso');
    return filas.map((f) => String(f.permiso));
  }

  async establecer(usuarioId: string, permisos: string[]): Promise<void> {
    // Reemplazo completo transaccional: borra lo que ya no venga en `permisos` e inserta lo nuevo.
    await this.knex.transaction(async (trx) => {
      await trx('usuarios_permisos_excepcionales').where({ usuario_id: usuarioId }).delete();
      if (permisos.length === 0) return;
      const ahora = new Date().toISOString();
      await trx('usuarios_permisos_excepcionales').insert(
        permisos.map((permiso) => ({ id: randomUUID(), usuario_id: usuarioId, permiso, creado_en: ahora }))
      );
    });
  }
}

export class PermisoCategoriaRepositoryKnex extends RepositorioBase implements IPermisoCategoriaRepository {
  async listarPorUsuario(usuarioId: string): Promise<PermisoCategoria[]> {
    const filas = await this.knex('usuarios_permisos_categoria').where({ usuario_id: usuarioId }).select('categoria_id', 'permiso');
    return filas.map((f) => ({ usuarioId, categoriaId: String(f.categoria_id), permiso: String(f.permiso) }));
  }

  async establecerParaCategoria(usuarioId: string, categoriaId: string, permisos: string[]): Promise<void> {
    // Reemplazo completo transaccional, pero acotado a ESTA categoría — no toca los permisos del usuario en otras categorías.
    await this.knex.transaction(async (trx) => {
      await trx('usuarios_permisos_categoria').where({ usuario_id: usuarioId, categoria_id: categoriaId }).delete();
      if (permisos.length === 0) return;
      const ahora = new Date().toISOString();
      await trx('usuarios_permisos_categoria').insert(
        permisos.map((permiso) => ({ id: randomUUID(), usuario_id: usuarioId, categoria_id: categoriaId, permiso, creado_en: ahora }))
      );
    });
  }
}

export class SesionRepositoryKnex extends RepositorioBase implements ISesionRepository {
  async obtener(id: string): Promise<Sesion | null> {
    const fila = await this.knex('sesiones').where({ id }).first();
    return fila ? aSesion(fila) : null;
  }

  async guardar(sesion: Sesion): Promise<void> {
    await upsert(this.knex, 'sesiones', { id: sesion.id }, deSesion(sesion));
  }

  async eliminar(id: string): Promise<void> {
    await this.knex('sesiones').where({ id }).delete();
  }
}

export function crearRepositorioDefinicionesPeriodicidad(knex: Knex): CatalogoRepositoryKnex<DefinicionPeriodicidad> {
  return new CatalogoRepositoryKnex(knex, 'periodicidades_personalizadas', aDefinicionPeriodicidad, deDefinicionPeriodicidad);
}

export function crearRepositorioOrigenesAutomaticos(knex: Knex): CatalogoRepositoryKnex<OrigenAutomatico> {
  return new CatalogoRepositoryKnex(knex, 'origenes_automaticos', aOrigenAutomatico, deOrigenAutomatico, true);
}

/**
 * Igual que Categoria, Equipo es un árbol simple (id + padreId) — la
 * validación de jerarquía (sin ciclos, bloqueo de borrado con hijos) vive
 * en la capa de aplicación (`ServicioEquipos`) sobre el `listar()` completo
 * de este repositorio genérico; no hace falta un método de consulta
 * específico para "hijos de X" a esta escala.
 */
export function crearRepositorioEquipos(knex: Knex): CatalogoRepositoryKnex<Equipo> {
  return new CatalogoRepositoryKnex(knex, 'equipos', aEquipo, deEquipo, true);
}
