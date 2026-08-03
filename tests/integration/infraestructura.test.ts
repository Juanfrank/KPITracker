import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crearInfraestructura } from '@infrastructure/bootstrap';
import type { Infraestructura } from '@infrastructure/bootstrap';
import { Periodicidad } from '@domain/index';
import type { Indicador, Lista, ElementoLista, Resultado } from '@domain/index';

let dataDir: string;
let infra: Infraestructura;

function indicador(id: string, parcial: Partial<Indicador> = {}): Indicador {
  return {
    id,
    nombre: `Indicador ${id}`,
    definicion: 'Definición de prueba',
    periodicidad: Periodicidad.Trimestral,
    periodicidadPersonalizadaId: null,
    lineaBase: 50,
    metaGlobal: 100,
    desagregaciones: [],
    estado: 'Activo',
    responsable: null,
    categoria: null,
    unidadMedida: '%',
    creadoEn: '2025-01-01T00:00:00Z',
    actualizadoEn: '2025-01-01T00:00:00Z',
    ...parcial
  };
}

function lista(id: string): Lista {
  return {
    id,
    nombre: `Lista ${id}`,
    descripcion: '',
    estado: 'Activa',
    version: 1,
    orden: 1,
    jerarquica: false,
    creadoEn: '2025-01-01T00:00:00Z',
    actualizadoEn: '2025-01-01T00:00:00Z'
  };
}

function elemento(listaId: string, codigo: string, orden: number): ElementoLista {
  return { id: `${listaId}-${codigo}`, listaId, codigo, descripcion: `Elem ${codigo}`, orden, padreCodigo: null, activo: true };
}

function resultado(id: string, indicadorId: string, periodoId: string, clave: string, valor: number | null): Resultado {
  return {
    id,
    indicadorId,
    periodoId,
    anio: Number(periodoId.slice(0, 4)),
    claveDesagregacion: clave,
    valor,
    observacion: null,
    creadoEn: '2025-04-05T00:00:00Z',
    actualizadoEn: '2025-04-05T00:00:00Z'
  };
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-test-'));
  infra = await crearInfraestructura(dataDir, { debounceMs: 0 });
});

afterEach(async () => {
  await infra.cerrar();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('Infraestructura DuckDB + Parquet', () => {
  it('crea la estructura del Data Lake al inicializar', () => {
    for (const dir of ['Config', 'Dimensions', 'Facts', 'Logs', 'Export']) {
      expect(existsSync(join(dataDir, dir))).toBe(true);
    }
  });

  it('CRUD de indicadores con round-trip fiel', async () => {
    const ind = indicador('i1', { desagregaciones: ['sexo', 'provincia'] });
    await infra.indicadores.guardar(ind);
    const leido = await infra.indicadores.obtener('i1');
    expect(leido).toEqual(ind);

    await infra.indicadores.guardar({ ...ind, nombre: 'Renombrado' });
    expect((await infra.indicadores.listar()).map((i) => i.nombre)).toContain('Renombrado');

    await infra.indicadores.eliminar('i1');
    expect(await infra.indicadores.obtener('i1')).toBeNull();
  });

  it('listas con elementos jerárquicos', async () => {
    await infra.listas.guardar({ ...lista('geo'), jerarquica: true });
    await infra.listas.guardarElemento(elemento('geo', 'PAIS', 1));
    await infra.listas.guardarElemento({ ...elemento('geo', 'PROV1', 2), padreCodigo: 'PAIS' });
    const elementos = await infra.listas.listarElementos('geo');
    expect(elementos).toHaveLength(2);
    expect(elementos[1]?.padreCodigo).toBe('PAIS');
  });

  it('upsert de resultados por clave natural (autoguardado idempotente)', async () => {
    await infra.indicadores.guardar(indicador('i1'));
    await infra.resultados.guardar(resultado('r1', 'i1', '2025-Trimestral-01', 'GENERAL', 10));
    await infra.resultados.guardar(resultado('r2', 'i1', '2025-Trimestral-01', 'GENERAL', 25));
    const filas = await infra.resultados.obtenerPorIndicadorPeriodo('i1', '2025-Trimestral-01');
    expect(filas).toHaveLength(1);
    expect(filas[0]?.valor).toBe(25);
  });

  it('materializa Parquet particionado por año y restaura desde Parquet', async () => {
    await infra.indicadores.guardar(indicador('i1'));
    await infra.resultados.guardar(resultado('r1', 'i1', '2025-Trimestral-01', 'GENERAL', 42));
    await infra.resultados.guardar(resultado('r2', 'i1', '2024-Trimestral-04', 'GENERAL', 33));
    await infra.sync.sincronizar();

    expect(existsSync(join(dataDir, 'Config', 'Indicadores.parquet'))).toBe(true);
    expect(existsSync(join(dataDir, 'Facts', 'FactResultados', 'anio=2025', 'datos.parquet'))).toBe(true);
    expect(existsSync(join(dataDir, 'Facts', 'FactResultados', 'anio=2024', 'datos.parquet'))).toBe(true);

    // Simula reinstalación: se pierde la base de trabajo pero queda /Data.
    await infra.cerrar();
    rmSync(join(dataDir, 'trabajo.duckdb'), { force: true });
    infra = await crearInfraestructura(dataDir, { debounceMs: 0 });

    expect((await infra.indicadores.obtener('i1'))?.nombre).toBe('Indicador i1');
    const restaurados = await infra.resultados.obtenerPorIndicadorPeriodo('i1', '2024-Trimestral-04');
    expect(restaurados[0]?.valor).toBe(33);
  });

  it('levantamientos: fecha de corte única por período y exclusiones temporales', async () => {
    await infra.resultados.guardarLevantamiento({
      id: 'l1',
      indicadorId: 'i1',
      periodoId: '2025-Trimestral-01',
      anio: 2025,
      fechaCorte: '2025-03-31',
      desagregacionesExcluidas: ['tribunal'],
      creadoEn: '2025-04-01T00:00:00Z',
      actualizadoEn: '2025-04-01T00:00:00Z'
    });
    const lev = await infra.resultados.obtenerLevantamiento('i1', '2025-Trimestral-01');
    expect(lev?.fechaCorte).toBe('2025-03-31');
    expect(lev?.desagregacionesExcluidas).toEqual(['tribunal']);
  });

  it('auditoría registra y consulta con filtros', async () => {
    await infra.auditoria.registrar({
      id: 'a1',
      usuario: 'local',
      fechaHora: '2025-04-01T10:00:00Z',
      accion: 'Modificar',
      entidad: 'Resultado',
      entidadId: 'r1',
      campo: 'valor',
      valorAnterior: '10',
      valorNuevo: '25'
    });
    const registros = await infra.auditoria.consultar({ entidad: 'Resultado' });
    expect(registros).toHaveLength(1);
    expect(registros[0]?.valorNuevo).toBe('25');
    expect(await infra.auditoria.consultar({ entidad: 'Indicador' })).toHaveLength(0);
  });

  it('la exportación analítica genera Parquet desnormalizado con desagregaciones como columnas', async () => {
    await infra.listas.guardar(lista('sexo'));
    await infra.listas.guardarElemento(elemento('sexo', 'M', 1));
    await infra.listas.guardarElemento(elemento('sexo', 'F', 2));
    await infra.indicadores.guardar(indicador('i1', { desagregaciones: ['sexo'] }));
    await infra.resultados.guardar(resultado('r1', 'i1', '2025-Trimestral-01', 'GENERAL', 80));
    await infra.resultados.guardar(resultado('r2', 'i1', '2025-Trimestral-01', 'sexo=M', 70));
    await infra.resultados.guardar(resultado('r3', 'i1', '2025-Trimestral-01', 'sexo=F', 90));
    await infra.resultados.guardarLevantamiento({
      id: 'l1', indicadorId: 'i1', periodoId: '2025-Trimestral-01', anio: 2025,
      fechaCorte: '2025-03-31', desagregacionesExcluidas: [],
      creadoEn: '2025-04-01T00:00:00Z', actualizadoEn: '2025-04-01T00:00:00Z'
    });

    await infra.exportacion.regenerar();

    const rutaExport = join(dataDir, 'Export', 'ResultadosAnalitico.parquet');
    expect(existsSync(rutaExport)).toBe(true);
    const filas = await infra.db.all(
      `SELECT * FROM read_parquet('${rutaExport.replace(/'/g, "''")}') ORDER BY desagregacion`
    );
    expect(filas).toHaveLength(3);
    const general = filas.find((f) => f.es_general === true);
    expect(general?.valor).toBe(80);
    expect(general?.['Lista sexo']).toBe('Total');
    expect(general?.fecha_corte).toBe('2025-03-31');
    expect(Number(general?.cumplimiento_meta_pct)).toBeCloseTo(80);
    const hombres = filas.find((f) => String(f.desagregacion).includes('sexo=M'));
    expect(hombres?.['Lista sexo']).toBe('Elem M');

    // Dimensiones del star schema.
    for (const dim of ['DimIndicador', 'DimPeriodo', 'DimFecha', 'DimLista', 'DimElementoLista', 'DimAtributo', 'DimDesagregacion']) {
      expect(existsSync(join(dataDir, 'Dimensions', `${dim}.parquet`))).toBe(true);
    }
  });

  it('exporta CSV cuando está configurado', async () => {
    const config = await infra.configuracion.obtener();
    await infra.configuracion.guardar({ ...config, exportarCsv: true });
    await infra.indicadores.guardar(indicador('i1'));
    await infra.resultados.guardar(resultado('r1', 'i1', '2025-Trimestral-01', 'GENERAL', 10));
    await infra.exportacion.regenerar();
    expect(existsSync(join(dataDir, 'Export', 'ResultadosAnalitico.csv'))).toBe(true);
  });

  it('configuración portable: export/import JSON versionado round-trip', async () => {
    await infra.listas.guardar(lista('sexo'));
    await infra.listas.guardarElemento(elemento('sexo', 'M', 1));
    await infra.indicadores.guardar(indicador('i1', { desagregaciones: ['sexo'] }));
    await infra.metas.guardar({
      id: 'm1', indicadorId: 'i1', claveDesagregacion: 'GENERAL', valor: 95,
      periodicidadMedicion: Periodicidad.Anual, metodoCalculo: 'Promedio', anioVigencia: 2025,
      creadoEn: '2025-01-01T00:00:00Z', actualizadoEn: '2025-01-01T00:00:00Z'
    });

    const json = await infra.configPortable.exportar();
    const archivo = JSON.parse(json);
    expect(archivo.formato).toBe('kpitracker-config');
    expect(archivo.schemaVersion).toBe(2);
    expect(archivo.indicadores).toHaveLength(1);

    // Importa en una instancia limpia.
    const dataDir2 = mkdtempSync(join(tmpdir(), 'kpitracker-test2-'));
    const infra2 = await crearInfraestructura(dataDir2, { debounceMs: 0 });
    try {
      await infra2.configPortable.importar(json);
      expect((await infra2.indicadores.obtener('i1'))?.desagregaciones).toEqual(['sexo']);
      expect(await infra2.listas.listarElementos('sexo')).toHaveLength(1);
      expect(await infra2.metas.listarPorIndicador('i1')).toHaveLength(1);
    } finally {
      await infra2.cerrar();
      rmSync(dataDir2, { recursive: true, force: true });
    }
  });

  it('rechaza importar una configuración de versión futura', async () => {
    const json = await infra.configPortable.exportar();
    const archivo = JSON.parse(json);
    archivo.schemaVersion = 999;
    await expect(infra.configPortable.importar(JSON.stringify(archivo))).rejects.toThrow(/versión más nueva/);
  });
});
