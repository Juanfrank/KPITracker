import type {
  Atributo, ElementoLista, Indicador, Levantamiento, Lista, Meta,
  RegistroAuditoria, ReglaNegocio, Resultado
} from '@domain/index';
import type {
  FiltroAuditoria, IAtributoRepository, IAuditoriaRepository, IIndicadorRepository,
  IListaRepository, IMetaRepository, IReglaRepository, IResultadoRepository,
  ResumenPeriodo, ValorAtributoEntidad
} from '@application/ports/index';
import type { Db } from '../duckdb/Db';
import type { ParquetSyncService } from '../parquet/ParquetSyncService';
import {
  aAtributo, aAuditoria, aElemento, aIndicador, aLevantamiento, aLista, aMeta,
  aRegla, aResultado, deAtributo, deElemento, deIndicador, deLista, deMeta, deRegla
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

export class IndicadorRepositoryDuckDb extends RepositorioBase implements IIndicadorRepository {
  async listar(): Promise<Indicador[]> {
    return (await this.db.all('SELECT * FROM indicadores ORDER BY nombre')).map(aIndicador);
  }

  async obtener(id: string): Promise<Indicador | null> {
    const fila = await this.db.uno('SELECT * FROM indicadores WHERE id = ?', [id]);
    return fila ? aIndicador(fila) : null;
  }

  async guardar(indicador: Indicador): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO indicadores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  async listar(entidad?: string): Promise<Atributo[]> {
    const filas = entidad
      ? await this.db.all('SELECT * FROM atributos WHERE entidad = ? ORDER BY grupo, orden', [entidad])
      : await this.db.all('SELECT * FROM atributos ORDER BY grupo, orden');
    return filas.map(aAtributo);
  }

  async obtener(id: string): Promise<Atributo | null> {
    const fila = await this.db.uno('SELECT * FROM atributos WHERE id = ?', [id]);
    return fila ? aAtributo(fila) : null;
  }

  async guardar(atributo: Atributo): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO atributos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      deAtributo(atributo)
    );
    this.sync.marcarSucia('atributos');
  }

  async eliminar(id: string): Promise<void> {
    await this.db.transaccion([
      { sql: 'DELETE FROM atributos WHERE id = ?', valores: [id] },
      { sql: 'DELETE FROM valores_atributos WHERE atributo_id = ?', valores: [id] }
    ]);
    this.sync.marcarSucia('atributos');
    this.sync.marcarSucia('valores_atributos');
  }

  async obtenerValores(entidadTipo: string, entidadId: string): Promise<ValorAtributoEntidad[]> {
    const filas = await this.db.all(
      'SELECT * FROM valores_atributos WHERE entidad_tipo = ? AND entidad_id = ?',
      [entidadTipo, entidadId]
    );
    return filas.map((f) => ({
      atributoId: String(f.atributo_id),
      entidadTipo: String(f.entidad_tipo),
      entidadId: String(f.entidad_id),
      valorTexto: f.valor_texto == null ? null : String(f.valor_texto),
      valorNumero: f.valor_numero == null ? null : Number(f.valor_numero),
      valorFecha: f.valor_fecha == null ? null : String(f.valor_fecha),
      valorBooleano: f.valor_booleano == null ? null : Boolean(f.valor_booleano)
    }));
  }

  async guardarValor(valor: ValorAtributoEntidad): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO valores_atributos VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [valor.atributoId, valor.entidadTipo, valor.entidadId, valor.valorTexto, valor.valorNumero, valor.valorFecha, valor.valorBooleano]
    );
    this.sync.marcarSucia('valores_atributos');
  }
}

export class ListaRepositoryDuckDb extends RepositorioBase implements IListaRepository {
  async listar(): Promise<Lista[]> {
    return (await this.db.all('SELECT * FROM listas ORDER BY orden, nombre')).map(aLista);
  }

  async obtener(id: string): Promise<Lista | null> {
    const fila = await this.db.uno('SELECT * FROM listas WHERE id = ?', [id]);
    return fila ? aLista(fila) : null;
  }

  async guardar(lista: Lista): Promise<void> {
    await this.db.run('INSERT OR REPLACE INTO listas VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', deLista(lista));
    this.sync.marcarSucia('listas');
  }

  async eliminar(id: string): Promise<void> {
    await this.db.transaccion([
      { sql: 'DELETE FROM listas WHERE id = ?', valores: [id] },
      { sql: 'DELETE FROM elementos_lista WHERE lista_id = ?', valores: [id] }
    ]);
    this.sync.marcarSucia('listas');
    this.sync.marcarSucia('elementos_lista');
  }

  async listarElementos(listaId: string): Promise<ElementoLista[]> {
    const filas = await this.db.all('SELECT * FROM elementos_lista WHERE lista_id = ? ORDER BY orden, codigo', [listaId]);
    return filas.map(aElemento);
  }

  async guardarElemento(elemento: ElementoLista): Promise<void> {
    await this.db.run('INSERT OR REPLACE INTO elementos_lista VALUES (?, ?, ?, ?, ?, ?, ?)', deElemento(elemento));
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
    await this.db.run('INSERT OR REPLACE INTO metas VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', deMeta(meta));
    this.sync.marcarSucia('metas');
  }

  async eliminar(id: string): Promise<void> {
    await this.db.run('DELETE FROM metas WHERE id = ?', [id]);
    this.sync.marcarSucia('metas');
  }
}

export class ReglaRepositoryDuckDb extends RepositorioBase implements IReglaRepository {
  async listar(entidad?: string): Promise<ReglaNegocio[]> {
    const filas = entidad
      ? await this.db.all('SELECT * FROM reglas WHERE entidad = ? ORDER BY nombre', [entidad])
      : await this.db.all('SELECT * FROM reglas ORDER BY nombre');
    return filas.map(aRegla);
  }

  async guardar(regla: ReglaNegocio): Promise<void> {
    await this.db.run('INSERT OR REPLACE INTO reglas VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', deRegla(regla));
    this.sync.marcarSucia('reglas');
  }

  async eliminar(id: string): Promise<void> {
    await this.db.run('DELETE FROM reglas WHERE id = ?', [id]);
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
      `INSERT INTO levantamientos (id, indicador_id, periodo_id, anio, fecha_corte, desagregaciones_excluidas, creado_en, actualizado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (indicador_id, periodo_id)
       DO UPDATE SET fecha_corte = excluded.fecha_corte,
                     desagregaciones_excluidas = excluded.desagregaciones_excluidas,
                     actualizado_en = excluded.actualizado_en`,
      [levantamiento.id, levantamiento.indicadorId, levantamiento.periodoId, levantamiento.anio,
       levantamiento.fechaCorte, JSON.stringify(levantamiento.desagregacionesExcluidas),
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
}

export class AuditoriaRepositoryDuckDb extends RepositorioBase implements IAuditoriaRepository {
  async registrar(registro: RegistroAuditoria): Promise<void> {
    await this.db.run(
      'INSERT INTO auditoria VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
