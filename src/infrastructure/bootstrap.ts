import type { Categoria, DefinicionPeriodicidad, Responsable } from '@domain/index';
import { Db } from './duckdb/Db';
import { crearEsquema, restaurarDesdeParquetSiVacio } from './duckdb/esquema';
import { RutasDataLake } from './parquet/RutasDataLake';
import { ParquetSyncService } from './parquet/ParquetSyncService';
import {
  AtributoRepositoryDuckDb, AuditoriaRepositoryDuckDb, CatalogoRepositoryDuckDb, IndicadorRepositoryDuckDb,
  ListaRepositoryDuckDb, MetaRepositoryDuckDb, ReglaRepositoryDuckDb, ResultadoRepositoryDuckDb,
  crearRepositorioDefinicionesPeriodicidad
} from './repositories/RepositoriosDuckDb';
import { aCategoria, aResponsable, deCategoria, deResponsable } from './repositories/mapeos';
import { ConfiguracionRepositoryJson } from './repositories/ConfiguracionRepositoryJson';
import { ExportAnaliticoService } from './export/ExportAnaliticoService';
import { ConfigPortableService } from './config-portable/ConfigPortableService';
import { GeneradorUuid, RelojSistema } from './soporte/servicios';

export interface Infraestructura {
  db: Db;
  rutas: RutasDataLake;
  sync: ParquetSyncService;
  reloj: RelojSistema;
  ids: GeneradorUuid;
  configuracion: ConfiguracionRepositoryJson;
  indicadores: IndicadorRepositoryDuckDb;
  atributos: AtributoRepositoryDuckDb;
  listas: ListaRepositoryDuckDb;
  metas: MetaRepositoryDuckDb;
  reglas: ReglaRepositoryDuckDb;
  periodicidades: CatalogoRepositoryDuckDb<DefinicionPeriodicidad>;
  responsables: CatalogoRepositoryDuckDb<Responsable>;
  categorias: CatalogoRepositoryDuckDb<Categoria>;
  resultados: ResultadoRepositoryDuckDb;
  auditoria: AuditoriaRepositoryDuckDb;
  exportacion: ExportAnaliticoService;
  configPortable: ConfigPortableService;
  cerrar(): Promise<void>;
}

export interface OpcionesInfraestructura {
  /** Debounce de sincronización Parquet/export (0 en tests). */
  debounceMs?: number;
}

/**
 * Composition root de la infraestructura: crea el Data Lake local, abre
 * DuckDB embebido, restaura desde Parquet si corresponde y cablea los
 * repositorios. Es la única función que conoce implementaciones concretas.
 */
export async function crearInfraestructura(
  dataDir: string,
  opciones: OpcionesInfraestructura = {}
): Promise<Infraestructura> {
  const rutas = new RutasDataLake(dataDir);
  rutas.crearDirectorios();

  const db = await Db.abrir(rutas.baseTrabajo);
  await crearEsquema(db);
  await restaurarDesdeParquetSiVacio(db, dataDir);

  const debounceMs = opciones.debounceMs ?? 500;
  const sync = new ParquetSyncService(db, rutas, debounceMs);
  const configuracion = new ConfiguracionRepositoryJson(rutas);
  const exportacion = new ExportAnaliticoService(db, rutas, configuracion, debounceMs * 2);

  const indicadores = new IndicadorRepositoryDuckDb(db, sync);
  const atributos = new AtributoRepositoryDuckDb(db, sync);
  const listas = new ListaRepositoryDuckDb(db, sync);
  const metas = new MetaRepositoryDuckDb(db, sync);
  const reglas = new ReglaRepositoryDuckDb(db, sync);
  const periodicidades = crearRepositorioDefinicionesPeriodicidad(db, sync);
  const responsables = new CatalogoRepositoryDuckDb(db, sync, 'responsables', aResponsable, deResponsable);
  const categorias = new CatalogoRepositoryDuckDb(db, sync, 'categorias', aCategoria, deCategoria);
  const resultados = new ResultadoRepositoryDuckDb(db, sync);
  const auditoria = new AuditoriaRepositoryDuckDb(db, sync);
  const configPortable = new ConfigPortableService(
    configuracion, indicadores, atributos, listas, reglas, metas, periodicidades, responsables, categorias
  );

  return {
    db,
    rutas,
    sync,
    reloj: new RelojSistema(),
    ids: new GeneradorUuid(),
    configuracion,
    indicadores,
    atributos,
    listas,
    metas,
    reglas,
    periodicidades,
    responsables,
    categorias,
    resultados,
    auditoria,
    exportacion,
    configPortable,
    async cerrar() {
      await sync.sincronizar();
      db.cerrar();
    }
  };
}
