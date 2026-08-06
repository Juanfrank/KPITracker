import type {
  Adjunto, AliasDesagregacionOrigen, Atributo, AutomatizacionIndicador, DefinicionPeriodicidad, ElementoLista,
  EntidadAdjunto, Indicador, Levantamiento, Lista, Meta, OrigenAutomatico, RegistroAuditoria, ReglaNegocio,
  Resultado, ResultadoHistorial
} from '@domain/index';
import type {
  FiltroAuditoria, IAdjuntoRepository, IAliasDesagregacionOrigenRepository, IAtributoRepository,
  IAuditoriaRepository, IAutomatizacionIndicadorRepository, ICatalogoRepository, IIndicadorRepository,
  IListaRepository, IMetaRepository, IReglaRepository, IResultadoRepository, ResumenPeriodo, ValorAtributoEntidad
} from '@application/ports/index';
import type { Db } from '../duckdb/Db';
import type { ParquetSyncService } from '../parquet/ParquetSyncService';
import {
  aAdjunto, aAliasDesagregacionOrigen, aAtributo, aAuditoria, aAutomatizacionIndicador, aDefinicionPeriodicidad,
  aElemento, aIndicador, aLevantamiento, aLista, aMeta, aOrigenAutomatico, aRegla, aResultado, aResultadoHistorial,
  deAdjunto, deAliasDesagregacionOrigen, deAtributo, deAutomatizacionIndicador, deDefinicionPeriodicidad,
  deElemento, deIndicador, deLista, deMeta, deOrigenAutomatico, deRegla, deResultadoHistorial
} from './mapeos';

/**
 * Implementaciones DuckDB/Parquet de los puertos de persistencia.
 * Tras cada escritura marcan la tabla como sucia en el ParquetSyncService,
 * que materializa a Parquet con debounce (autoguardado sin reescrituras
 * completas).
 */

abstract class RepositorioBase {
  constructor(
    protected readonly db: Db,
    protected readonly sync: ParquetSyncService
  ) {}
}

/**
 * Filtro NULL-safe para excluir ítems con borrado lógico: `eliminado` es una
 * columna agregada vía `ALTER TABLE ADD COLUMN` (sin `NOT NULL`, DuckDB no lo
 * permite ahí), así que filas preexistentes a la migración pueden tenerla en
 * NULL — deben tratarse como "no eliminado".
 */
const FILTRO_NO_ELIMINADO = '(eliminado = false OR eliminado IS NULL)';

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

export class IndicadorRepositoryDuckDb extends RepositorioBase implements IIndicadorRepository {
  async listar(): Promise<Indicador[]> {
    return (await this.db.all('SELECT * FROM indicadores ORDER BY nombre')).map(aIndicador);
  }

  async obtener(id: string): Promise<Indicador | null> {
    const fila = await this.db.uno('SELECT * FROM indicadores WHERE id = ?', [id]);
    return fila ? aIndicador(fila) : null;
  }

  async buscarPorCodigo(codigo: string, excluirId?: string): Promise<Indicador | null> {
    const fila = excluirId
      ? await this.db.uno('SELECT * FROM indicadores WHERE codigo = ? AND id != ?', [codigo, excluirId])
      : await this.db.uno('SELECT * FROM indicadores WHERE codigo = ?', [codigo]);
    return fila ? aIndicador(fila) : null;
  }

  async guardar(indicador: Indicador): Promise<void> {
    // Columnas explícitas: `VALUES (?, ?, ...)` sin nombrar columnas se liga
    // por POSICIÓN FÍSICA en la tabla, que para una base de trabajo creada
    // por una versión anterior no coincide con el orden de este arreglo — las
    // columnas agregadas después vía ALTER TABLE ADD COLUMN quedan al final
    // físicamente, sin importar dónde aparezcan en TABLAS.indicadores (ver
    // esquema.ts). Nombrar las columnas liga por NOMBRE, inmune a ese desfase.
    await this.db.run(
      `INSERT OR REPLACE INTO indicadores (
         id, codigo, nombre, definicion, forma_calculo, periodicidad, linea_base, linea_base_periodo_id, meta_global,
         desagregaciones, estado, responsable, categoria, unidad_medida, periodicidad_personalizada_id, es_calculado,
         formula, origen_automatico_id, parametros_origen, creado_en, actualizado_en
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      deIndicador(indicador)
    );
    this.sync.marcarSucia('indicadores');
  }

  async eliminar(id: string): Promise<void> {
    await this.db.run('DELETE FROM indicadores WHERE id = ?', [id]);
    this.sync.marcarSucia('indicadores');
  }
}

export class AtributoRepositoryDuckDb extends RepositorioBase implements IAtributoRepository {
  async listar(entidad?: string, incluirEliminados = false): Promise<Atributo[]> {
    const filtroEliminado = incluirEliminados ? 'TRUE' : FILTRO_NO_ELIMINADO;
    const filas = entidad
      ? await this.db.all(
          `SELECT * FROM atributos WHERE entidad = ? AND ${filtroEliminado} ORDER BY grupo, orden`,
          [entidad]
        )
      : await this.db.all(`SELECT * FROM atributos WHERE ${filtroEliminado} ORDER BY grupo, orden`);
    return filas.map(aAtributo);
  }

  async obtener(id: string): Promise<Atributo | null> {
    const fila = await this.db.uno('SELECT * FROM atributos WHERE id = ?', [id]);
    return fila ? aAtributo(fila) : null;
  }

  async guardar(atributo: Atributo): Promise<void> {
    // Columnas explícitas por la misma razón que en IndicadorRepositoryDuckDb.guardar
    // (`atributos` también tuvo una migración aditiva: `filtrable`).
    await this.db.run(
      `INSERT OR REPLACE INTO atributos (
         id, entidad, nombre, descripcion, grupo, orden, visible, editable, obligatorio, valor_por_defecto,
         tipo_dato, lista_id, validaciones, condicion_visibilidad, condicion_obligatorio, filtrable, activo,
         eliminado, creado_en, actualizado_en
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      deAtributo(atributo)
    );
    this.sync.marcarSucia('atributos');
  }

  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    // Sin cascada: los valores capturados (`valores_atributos`) se conservan
    // intactos para poder restaurar el atributo sin perder datos históricos.
    await this.db.run(
      'UPDATE atributos SET eliminado = ?, activo = ?, actualizado_en = ? WHERE id = ?',
      [eliminado, !eliminado, new Date().toISOString(), id]
    );
    this.sync.marcarSucia('atributos');
  }

  async obtenerValores(entidadTipo: string, entidadId: string): Promise<ValorAtributoEntidad[]> {
    const filas = await this.db.all(
      'SELECT * FROM valores_atributos WHERE entidad_tipo = ? AND entidad_id = ?',
      [entidadTipo, entidadId]
    );
    return filas.map(aValorAtributoEntidad);
  }

  async listarEntidadesConValor(atributoId: string): Promise<ValorAtributoEntidad[]> {
    const filas = await this.db.all('SELECT * FROM valores_atributos WHERE atributo_id = ?', [atributoId]);
    return filas.map(aValorAtributoEntidad);
  }

  async guardarValor(valor: ValorAtributoEntidad): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO valores_atributos (
         atributo_id, entidad_tipo, entidad_id, valor_texto, valor_numero, valor_fecha, valor_booleano
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [valor.atributoId, valor.entidadTipo, valor.entidadId, valor.valorTexto, valor.valorNumero, valor.valorFecha, valor.valorBooleano]
    );
    this.sync.marcarSucia('valores_atributos');
  }
}

export class ListaRepositoryDuckDb extends RepositorioBase implements IListaRepository {
  async listar(incluirEliminados = false): Promise<Lista[]> {
    const filtroEliminado = incluirEliminados ? 'TRUE' : FILTRO_NO_ELIMINADO;
    return (await this.db.all(`SELECT * FROM listas WHERE ${filtroEliminado} ORDER BY orden, nombre`)).map(aLista);
  }

  async obtener(id: string): Promise<Lista | null> {
    const fila = await this.db.uno('SELECT * FROM listas WHERE id = ?', [id]);
    return fila ? aLista(fila) : null;
  }

  async guardar(lista: Lista): Promise<void> {
    // Columnas explícitas: `listas` tuvo una migración aditiva (`prefijo`).
    await this.db.run(
      `INSERT OR REPLACE INTO listas (id, nombre, descripcion, prefijo, estado, version, orden, jerarquica, eliminado, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      deLista(lista)
    );
    this.sync.marcarSucia('listas');
  }

  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    // Sin cascada: los elementos de la lista se conservan intactos para
    // poder restaurar la lista sin perder datos.
    await this.db.run(
      'UPDATE listas SET eliminado = ?, estado = ?, actualizado_en = ? WHERE id = ?',
      [eliminado, eliminado ? 'Inactiva' : 'Activa', new Date().toISOString(), id]
    );
    this.sync.marcarSucia('listas');
  }

  async listarElementos(listaId: string): Promise<ElementoLista[]> {
    const filas = await this.db.all('SELECT * FROM elementos_lista WHERE lista_id = ? ORDER BY orden, codigo', [listaId]);
    return filas.map(aElemento);
  }

  async guardarElemento(elemento: ElementoLista): Promise<void> {
    // Columnas explícitas: `elementos_lista` tuvo una migración aditiva (`nombre`).
    await this.db.run(
      'INSERT OR REPLACE INTO elementos_lista (id, lista_id, codigo, nombre, descripcion, orden, padre_codigo, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      deElemento(elemento)
    );
    this.sync.marcarSucia('elementos_lista');
  }

  async eliminarElemento(id: string): Promise<void> {
    await this.db.run('DELETE FROM elementos_lista WHERE id = ?', [id]);
    this.sync.marcarSucia('elementos_lista');
  }
}

export class MetaRepositoryDuckDb extends RepositorioBase implements IMetaRepository {
  async listarPorIndicador(indicadorId: string): Promise<Meta[]> {
    const filas = await this.db.all('SELECT * FROM metas WHERE indicador_id = ? ORDER BY anio_vigencia, clave_desagregacion', [indicadorId]);
    return filas.map(aMeta);
  }

  async guardar(meta: Meta): Promise<void> {
    // Columnas explícitas: `metas` tuvo una migración aditiva (`periodicidad_personalizada_id`).
    await this.db.run(
      `INSERT OR REPLACE INTO metas (
         id, indicador_id, clave_desagregacion, valor, periodicidad_medicion, periodicidad_personalizada_id,
         metodo_calculo, anio_vigencia, creado_en, actualizado_en
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      deMeta(meta)
    );
    this.sync.marcarSucia('metas');
  }

  async eliminar(id: string): Promise<void> {
    await this.db.run('DELETE FROM metas WHERE id = ?', [id]);
    this.sync.marcarSucia('metas');
  }
}

export class ReglaRepositoryDuckDb extends RepositorioBase implements IReglaRepository {
  async listar(entidad?: string, incluirEliminados = false): Promise<ReglaNegocio[]> {
    const filtroEliminado = incluirEliminados ? 'TRUE' : FILTRO_NO_ELIMINADO;
    const filas = entidad
      ? await this.db.all(
          `SELECT * FROM reglas WHERE entidad = ? AND ${filtroEliminado} ORDER BY nombre`,
          [entidad]
        )
      : await this.db.all(`SELECT * FROM reglas WHERE ${filtroEliminado} ORDER BY nombre`);
    return filas.map(aRegla);
  }

  async obtener(id: string): Promise<ReglaNegocio | null> {
    const fila = await this.db.uno('SELECT * FROM reglas WHERE id = ?', [id]);
    return fila ? aRegla(fila) : null;
  }

  async guardar(regla: ReglaNegocio): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO reglas (
         id, nombre, descripcion, tipo, entidad, atributo_objetivo_id, condicion, mensaje_error, activa, eliminado, creado_en, actualizado_en
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      deRegla(regla)
    );
    this.sync.marcarSucia('reglas');
  }

  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    await this.db.run(
      'UPDATE reglas SET eliminado = ?, activa = ?, actualizado_en = ? WHERE id = ?',
      [eliminado, !eliminado, new Date().toISOString(), id]
    );
    this.sync.marcarSucia('reglas');
  }
}

export class ResultadoRepositoryDuckDb extends RepositorioBase implements IResultadoRepository {
  async obtenerPorIndicadorPeriodo(indicadorId: string, periodoId: string): Promise<Resultado[]> {
    const filas = await this.db.all(
      'SELECT * FROM resultados WHERE indicador_id = ? AND periodo_id = ? ORDER BY clave_desagregacion',
      [indicadorId, periodoId]
    );
    return filas.map(aResultado);
  }

  async guardar(resultado: Resultado): Promise<void> {
    // Upsert por clave natural (indicador, período, desagregación).
    await this.db.run(
      `INSERT INTO resultados (id, indicador_id, periodo_id, anio, clave_desagregacion, valor, observacion, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (indicador_id, periodo_id, clave_desagregacion)
       DO UPDATE SET valor = excluded.valor, observacion = excluded.observacion, actualizado_en = excluded.actualizado_en`,
      [resultado.id, resultado.indicadorId, resultado.periodoId, resultado.anio, resultado.claveDesagregacion,
       resultado.valor, resultado.observacion, resultado.creadoEn, resultado.actualizadoEn]
    );
    this.sync.marcarResultadosSucios(resultado.anio);
  }

  async obtenerLevantamiento(indicadorId: string, periodoId: string): Promise<Levantamiento | null> {
    const fila = await this.db.uno(
      'SELECT * FROM levantamientos WHERE indicador_id = ? AND periodo_id = ?',
      [indicadorId, periodoId]
    );
    return fila ? aLevantamiento(fila) : null;
  }

  async listarLevantamientos(indicadorId?: string): Promise<Levantamiento[]> {
    const filas = indicadorId
      ? await this.db.all('SELECT * FROM levantamientos WHERE indicador_id = ?', [indicadorId])
      : await this.db.all('SELECT * FROM levantamientos');
    return filas.map(aLevantamiento);
  }

  async guardarLevantamiento(levantamiento: Levantamiento): Promise<void> {
    await this.db.run(
      `INSERT INTO levantamientos (id, indicador_id, periodo_id, anio, fecha_corte, desagregaciones_excluidas, comentario, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (indicador_id, periodo_id)
       DO UPDATE SET fecha_corte = excluded.fecha_corte,
                     desagregaciones_excluidas = excluded.desagregaciones_excluidas,
                     comentario = excluded.comentario,
                     actualizado_en = excluded.actualizado_en`,
      [levantamiento.id, levantamiento.indicadorId, levantamiento.periodoId, levantamiento.anio,
       levantamiento.fechaCorte, JSON.stringify(levantamiento.desagregacionesExcluidas), levantamiento.comentario,
       levantamiento.creadoEn, levantamiento.actualizadoEn]
    );
    this.sync.marcarSucia('levantamientos');
  }

  async resumenPorIndicador(indicadorId: string): Promise<ResumenPeriodo[]> {
    const filas = await this.db.all(
      `SELECT indicador_id, periodo_id,
              COUNT(valor) FILTER (WHERE valor IS NOT NULL)::INT AS con_valor,
              MAX(actualizado_en) AS ultima
       FROM resultados WHERE indicador_id = ?
       GROUP BY indicador_id, periodo_id`,
      [indicadorId]
    );
    return filas.map((f) => ({
      indicadorId: String(f.indicador_id),
      periodoId: String(f.periodo_id),
      combinacionesConValor: Number(f.con_valor),
      ultimaActualizacion: f.ultima == null ? null : String(f.ultima)
    }));
  }

  async resumenGlobal(): Promise<ResumenPeriodo[]> {
    const filas = await this.db.all(
      `SELECT indicador_id, periodo_id,
              COUNT(valor) FILTER (WHERE valor IS NOT NULL)::INT AS con_valor,
              MAX(actualizado_en) AS ultima
       FROM resultados
       GROUP BY indicador_id, periodo_id`
    );
    return filas.map((f) => ({
      indicadorId: String(f.indicador_id),
      periodoId: String(f.periodo_id),
      combinacionesConValor: Number(f.con_valor),
      ultimaActualizacion: f.ultima == null ? null : String(f.ultima)
    }));
  }

  async resultadosGeneralPorIndicador(indicadorId: string): Promise<Array<{ periodoId: string; valor: number | null }>> {
    const filas = await this.db.all(
      `SELECT periodo_id, valor FROM resultados WHERE indicador_id = ? AND clave_desagregacion = 'GENERAL'`,
      [indicadorId]
    );
    return filas.map((f) => ({
      periodoId: String(f.periodo_id),
      valor: f.valor == null ? null : Number(f.valor)
    }));
  }

  async obtenerHistorial(indicadorId: string, periodoId: string, claveDesagregacion: string): Promise<ResultadoHistorial[]> {
    const filas = await this.db.all(
      `SELECT * FROM resultados_historial
       WHERE indicador_id = ? AND periodo_id = ? AND clave_desagregacion = ?
       ORDER BY version DESC`,
      [indicadorId, periodoId, claveDesagregacion]
    );
    return filas.map(aResultadoHistorial);
  }

  async registrarVersion(entrada: ResultadoHistorial): Promise<void> {
    await this.db.run(
      `INSERT INTO resultados_historial (
         id, indicador_id, periodo_id, clave_desagregacion, version, valor, observacion, usuario, actualizado_en
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      deResultadoHistorial(entrada)
    );
    this.sync.marcarSucia('resultados_historial');
  }
}

export class AuditoriaRepositoryDuckDb extends RepositorioBase implements IAuditoriaRepository {
  async registrar(registro: RegistroAuditoria): Promise<void> {
    await this.db.run(
      `INSERT INTO auditoria (id, usuario, fecha_hora, accion, entidad, entidad_id, campo, valor_anterior, valor_nuevo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [registro.id, registro.usuario, registro.fechaHora, registro.accion, registro.entidad,
       registro.entidadId, registro.campo, registro.valorAnterior, registro.valorNuevo]
    );
    this.sync.marcarSucia('auditoria');
  }

  async consultar(filtro: FiltroAuditoria): Promise<RegistroAuditoria[]> {
    const condiciones: string[] = [];
    const valores: unknown[] = [];
    if (filtro.entidad) {
      condiciones.push('entidad = ?');
      valores.push(filtro.entidad);
    }
    if (filtro.entidadId) {
      condiciones.push('entidad_id = ?');
      valores.push(filtro.entidadId);
    }
    if (filtro.desde) {
      condiciones.push('fecha_hora >= ?');
      valores.push(filtro.desde);
    }
    if (filtro.hasta) {
      condiciones.push('fecha_hora <= ?');
      valores.push(filtro.hasta);
    }
    const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
    const limite = Math.min(filtro.limite ?? 500, 5000);
    const filas = await this.db.all(
      `SELECT * FROM auditoria ${where} ORDER BY fecha_hora DESC LIMIT ${limite}`,
      valores
    );
    return filas.map(aAuditoria);
  }
}

/**
 * Repositorio genérico de catálogo (id, nombre, ...): usado tanto para
 * DefinicionPeriodicidad como para Responsable/Categoria. `tabla` y los
 * mapeadores se fijan en el composition root; nunca provienen de entrada
 * de usuario.
 */
export class CatalogoRepositoryDuckDb<T extends { readonly id: string }> extends RepositorioBase implements ICatalogoRepository<T> {
  constructor(
    db: Db,
    sync: ParquetSyncService,
    private readonly tabla: string,
    private readonly aEntidad: (fila: Record<string, unknown>) => T,
    private readonly deEntidad: (item: T) => unknown[],
    /**
     * Nombres de columna, en el mismo orden que produce `deEntidad`. Se usan
     * para nombrar explícitamente las columnas del INSERT: sin esto, `VALUES
     * (?, ?, ...)` liga por posición física en la tabla, que para una base de
     * trabajo creada por una versión anterior no coincide con este orden si
     * la tabla recibió columnas nuevas vía ALTER TABLE ADD COLUMN (quedan al
     * final físicamente, sin importar dónde aparezcan en esquema.ts).
     */
    private readonly columnas: string[],
    /**
     * `true` para tablas que tienen la columna `eliminado` (borrado lógico
     * bloqueado por uso, ver Batch M): `responsables`, `categorias`,
     * `origenes_automaticos`. `periodicidades_personalizadas` queda en
     * `false` (sigue con hard-delete vía `eliminar`).
     */
    private readonly soportaEliminado: boolean = false
  ) {
    super(db, sync);
  }

  async listar(incluirEliminados = false): Promise<T[]> {
    if (!this.soportaEliminado) {
      return (await this.db.all(`SELECT * FROM ${this.tabla} ORDER BY nombre`)).map(this.aEntidad);
    }
    const filtroEliminado = incluirEliminados ? 'TRUE' : FILTRO_NO_ELIMINADO;
    return (await this.db.all(`SELECT * FROM ${this.tabla} WHERE ${filtroEliminado} ORDER BY nombre`)).map(this.aEntidad);
  }

  async obtener(id: string): Promise<T | null> {
    const fila = await this.db.uno(`SELECT * FROM ${this.tabla} WHERE id = ?`, [id]);
    return fila ? this.aEntidad(fila) : null;
  }

  async guardar(item: T): Promise<void> {
    const valores = this.deEntidad(item);
    const marcadores = valores.map(() => '?').join(', ');
    await this.db.run(`INSERT OR REPLACE INTO ${this.tabla} (${this.columnas.join(', ')}) VALUES (${marcadores})`, valores);
    this.sync.marcarSucia(this.tabla);
  }

  /** Hard-delete: solo lo usa `periodicidades_personalizadas` (`soportaEliminado: false`). */
  async eliminar(id: string): Promise<void> {
    await this.db.run(`DELETE FROM ${this.tabla} WHERE id = ?`, [id]);
    this.sync.marcarSucia(this.tabla);
  }

  async marcarEliminado(id: string, eliminado: boolean): Promise<void> {
    if (!this.soportaEliminado) {
      throw new Error(`La tabla "${this.tabla}" no soporta borrado lógico.`);
    }
    await this.db.run(
      `UPDATE ${this.tabla} SET eliminado = ?, activo = ?, actualizado_en = ? WHERE id = ?`,
      [eliminado, !eliminado, new Date().toISOString(), id]
    );
    this.sync.marcarSucia(this.tabla);
  }
}

export class AdjuntoRepositoryDuckDb extends RepositorioBase implements IAdjuntoRepository {
  async listarPorEntidad(entidad: EntidadAdjunto, entidadId: string): Promise<Adjunto[]> {
    const filas = await this.db.all(
      'SELECT * FROM adjuntos WHERE entidad = ? AND entidad_id = ? ORDER BY subido_en DESC',
      [entidad, entidadId]
    );
    return filas.map(aAdjunto);
  }

  async obtener(id: string): Promise<Adjunto | null> {
    const fila = await this.db.uno('SELECT * FROM adjuntos WHERE id = ?', [id]);
    return fila ? aAdjunto(fila) : null;
  }

  async guardar(adjunto: Adjunto): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO adjuntos (id, entidad, entidad_id, nombre_archivo, ruta_relativa, tamanio_bytes, comentario, subido_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      deAdjunto(adjunto)
    );
    this.sync.marcarSucia('adjuntos');
  }

  async eliminar(id: string): Promise<void> {
    await this.db.run('DELETE FROM adjuntos WHERE id = ?', [id]);
    this.sync.marcarSucia('adjuntos');
  }
}

export class AutomatizacionIndicadorRepositoryDuckDb extends RepositorioBase implements IAutomatizacionIndicadorRepository {
  async obtenerPorIndicador(indicadorId: string): Promise<AutomatizacionIndicador | null> {
    const fila = await this.db.uno('SELECT * FROM automatizaciones_indicador WHERE indicador_id = ?', [indicadorId]);
    return fila ? aAutomatizacionIndicador(fila) : null;
  }

  async listarTodas(): Promise<AutomatizacionIndicador[]> {
    return (await this.db.all('SELECT * FROM automatizaciones_indicador ORDER BY indicador_id')).map(aAutomatizacionIndicador);
  }

  async guardar(config: AutomatizacionIndicador): Promise<void> {
    await this.db.run(
      `INSERT INTO automatizaciones_indicador (
         id, indicador_id, origen_automatico_id, parametros_dinamicos, script, columna_valor,
         mapeo_columnas, desagregaciones_omitidas, creado_en, actualizado_en
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (indicador_id) DO UPDATE SET
         origen_automatico_id = excluded.origen_automatico_id,
         parametros_dinamicos = excluded.parametros_dinamicos,
         script = excluded.script,
         columna_valor = excluded.columna_valor,
         mapeo_columnas = excluded.mapeo_columnas,
         desagregaciones_omitidas = excluded.desagregaciones_omitidas,
         actualizado_en = excluded.actualizado_en`,
      deAutomatizacionIndicador(config)
    );
    this.sync.marcarSucia('automatizaciones_indicador');
  }

  async eliminar(indicadorId: string): Promise<void> {
    await this.db.run('DELETE FROM automatizaciones_indicador WHERE indicador_id = ?', [indicadorId]);
    this.sync.marcarSucia('automatizaciones_indicador');
  }
}

export class AliasDesagregacionOrigenRepositoryDuckDb extends RepositorioBase implements IAliasDesagregacionOrigenRepository {
  async listarPorLista(listaId: string): Promise<AliasDesagregacionOrigen[]> {
    const filas = await this.db.all('SELECT * FROM alias_desagregacion_origen WHERE lista_id = ? ORDER BY alias', [listaId]);
    return filas.map(aAliasDesagregacionOrigen);
  }

  async listarPorOrigen(origenAutomaticoId: string): Promise<AliasDesagregacionOrigen[]> {
    const filas = await this.db.all(
      'SELECT * FROM alias_desagregacion_origen WHERE origen_automatico_id = ? ORDER BY alias',
      [origenAutomaticoId]
    );
    return filas.map(aAliasDesagregacionOrigen);
  }

  async listarTodos(): Promise<AliasDesagregacionOrigen[]> {
    return (await this.db.all('SELECT * FROM alias_desagregacion_origen ORDER BY alias')).map(aAliasDesagregacionOrigen);
  }

  async obtener(listaId: string, origenAutomaticoId: string): Promise<AliasDesagregacionOrigen | null> {
    const fila = await this.db.uno(
      'SELECT * FROM alias_desagregacion_origen WHERE lista_id = ? AND origen_automatico_id = ?',
      [listaId, origenAutomaticoId]
    );
    return fila ? aAliasDesagregacionOrigen(fila) : null;
  }

  async guardar(alias: AliasDesagregacionOrigen): Promise<void> {
    await this.db.run(
      `INSERT INTO alias_desagregacion_origen (id, lista_id, origen_automatico_id, alias, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (lista_id, origen_automatico_id) DO UPDATE SET alias = excluded.alias, actualizado_en = excluded.actualizado_en`,
      deAliasDesagregacionOrigen(alias)
    );
    this.sync.marcarSucia('alias_desagregacion_origen');
  }

  async eliminar(id: string): Promise<void> {
    await this.db.run('DELETE FROM alias_desagregacion_origen WHERE id = ?', [id]);
    this.sync.marcarSucia('alias_desagregacion_origen');
  }
}

export function crearRepositorioDefinicionesPeriodicidad(
  db: Db,
  sync: ParquetSyncService
): CatalogoRepositoryDuckDb<DefinicionPeriodicidad> {
  return new CatalogoRepositoryDuckDb(
    db, sync, 'periodicidades_personalizadas', aDefinicionPeriodicidad, deDefinicionPeriodicidad,
    ['id', 'nombre', 'descripcion', 'cortes', 'creado_en', 'actualizado_en']
  );
}

export function crearRepositorioOrigenesAutomaticos(
  db: Db,
  sync: ParquetSyncService
): CatalogoRepositoryDuckDb<OrigenAutomatico> {
  return new CatalogoRepositoryDuckDb(
    db, sync, 'origenes_automaticos', aOrigenAutomatico, deOrigenAutomatico,
    ['id', 'nombre', 'tipo', 'descripcion', 'configuracion', 'parametros_generales', 'activo', 'eliminado', 'creado_en', 'actualizado_en'],
    true
  );
}
