import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Db } from '@infrastructure/duckdb/Db';
import { RutasDataLake } from '@infrastructure/parquet/RutasDataLake';
import { ParquetSyncService } from '@infrastructure/parquet/ParquetSyncService';
import { MIGRACIONES_ADITIVAS } from '@infrastructure/duckdb/esquema';
import { CatalogoRepositoryDuckDb, IndicadorRepositoryDuckDb } from '@infrastructure/repositories/RepositoriosDuckDb';
import { aResponsable, deResponsable } from '@infrastructure/repositories/mapeos';
import { Periodicidad } from '@domain/index';
import type { Indicador, Responsable } from '@domain/index';

/**
 * Regresión: `INSERT ... VALUES (?, ?, ...)` sin nombrar columnas liga por
 * POSICIÓN FÍSICA en la tabla. Para una base de trabajo creada por una
 * versión temprana de la app, las columnas agregadas después vía `ALTER
 * TABLE ADD COLUMN` (ver MIGRACIONES_ADITIVAS en esquema.ts) quedan al FINAL
 * físicamente, sin importar la posición que ocupan hoy en el `CREATE TABLE`
 * de esquema.ts — desalineando el arreglo posicional que produce `deX()` y
 * causando errores como "Could not convert string 'Mensual' to DOUBLE"
 * (un valor de texto terminando en una columna DOUBLE) o, peor, datos
 * guardados en la columna equivocada sin ningún error visible.
 *
 * Esta prueba recrea esa situación real: crea `indicadores` con el esquema
 * "viejo" (sin las columnas agregadas después), aplica las migraciones
 * reales de esquema.ts en el mismo orden en que las aplicaría la app al
 * arrancar, y confirma que guardar/releer un indicador funciona y no cruza
 * valores entre columnas.
 */
describe('IndicadorRepositoryDuckDb — no desalinea columnas agregadas por migración', () => {
  it('guarda y relee correctamente un indicador en una tabla con el esquema viejo + migraciones aditivas aplicadas', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-test-migracion-'));
    const db = await Db.abrir(':memory:');
    try {
      // Esquema "viejo": la forma que tenía `indicadores` antes de que
      // codigo/linea_base_periodo_id/es_calculado/formula/forma_calculo/
      // periodicidad_personalizada_id/origen_automatico_id/parametros_origen
      // existieran.
      await db.run(`CREATE TABLE indicadores (
        id VARCHAR PRIMARY KEY,
        nombre VARCHAR NOT NULL,
        definicion VARCHAR NOT NULL DEFAULT '',
        periodicidad VARCHAR NOT NULL,
        linea_base DOUBLE,
        meta_global DOUBLE,
        desagregaciones VARCHAR NOT NULL DEFAULT '[]',
        estado VARCHAR NOT NULL DEFAULT 'Activo',
        responsable VARCHAR,
        categoria VARCHAR,
        unidad_medida VARCHAR,
        creado_en VARCHAR NOT NULL,
        actualizado_en VARCHAR NOT NULL
      )`);
      // Aplica las migraciones reales de producción (mismo código, mismo
      // orden): en DuckDB, ADD COLUMN siempre agrega al final físicamente,
      // así que estas columnas terminan DESPUÉS de actualizado_en aquí —
      // no en la posición que ocupan en TABLAS.indicadores hoy.
      for (const sql of MIGRACIONES_ADITIVAS) {
        if (sql.toLowerCase().includes('indicadores')) await db.run(sql);
      }

      const sync = new ParquetSyncService(db, new RutasDataLake(dataDir), 500);
      const repo = new IndicadorRepositoryDuckDb(db, sync);

      const indicador: Indicador = {
        id: 'ind-1', codigo: 'IND-001', nombre: 'Cobertura de atención', definicion: 'Definición de prueba',
        formaCalculo: null, periodicidad: Periodicidad.Mensual, periodicidadPersonalizadaId: null,
        lineaBase: 42.5, lineaBasePeriodoId: null, metaGlobal: 90,
        desagregaciones: [], estado: 'Activo', responsable: null, categoria: null, unidadMedida: '%',
        esCalculado: false, formula: null, creadoEn: '2026-01-01T00:00:00.000Z', actualizadoEn: '2026-01-01T00:00:00.000Z'
      };

      await expect(repo.guardar(indicador)).resolves.not.toThrow();

      const relido = await repo.obtener('ind-1');
      expect(relido?.periodicidad).toBe(Periodicidad.Mensual);
      expect(relido?.lineaBase).toBe(42.5);
      expect(relido?.metaGlobal).toBe(90);
      expect(relido?.codigo).toBe('IND-001');
      expect(relido?.nombre).toBe('Cobertura de atención');

      await sync.sincronizar();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('guarda y relee correctamente un responsable en una tabla con el esquema viejo (sin `eliminado`) + migración aditiva aplicada', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-test-migracion-eliminado-'));
    const db = await Db.abrir(':memory:');
    try {
      // Esquema "viejo": `responsables` antes de que existiera el borrado
      // lógico (columna `eliminado`, ver Batch M).
      await db.run(`CREATE TABLE responsables (
        id VARCHAR PRIMARY KEY,
        nombre VARCHAR NOT NULL,
        correo VARCHAR,
        activo BOOLEAN NOT NULL DEFAULT true,
        creado_en VARCHAR NOT NULL,
        actualizado_en VARCHAR NOT NULL
      )`);
      for (const sql of MIGRACIONES_ADITIVAS) {
        if (sql.toLowerCase().includes('responsables')) await db.run(sql);
      }

      const sync = new ParquetSyncService(db, new RutasDataLake(dataDir), 500);
      const repo = new CatalogoRepositoryDuckDb<Responsable>(
        db, sync, 'responsables', aResponsable, deResponsable,
        ['id', 'nombre', 'correo', 'activo', 'eliminado', 'creado_en', 'actualizado_en']
      );

      const responsable: Responsable = {
        id: 'resp-1', nombre: 'Persona de prueba', correo: 'prueba@example.com', activo: true, eliminado: false,
        creadoEn: '2026-01-01T00:00:00.000Z', actualizadoEn: '2026-01-01T00:00:00.000Z'
      };

      await expect(repo.guardar(responsable)).resolves.not.toThrow();

      const relido = await repo.obtener('resp-1');
      expect(relido?.nombre).toBe('Persona de prueba');
      expect(relido?.correo).toBe('prueba@example.com');
      expect(relido?.activo).toBe(true);
      expect(relido?.eliminado).toBe(false);

      await sync.sincronizar();
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
