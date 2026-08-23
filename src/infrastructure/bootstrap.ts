import type { Knex } from 'knex';
import type { Categoria, DefinicionPeriodicidad, Equipo, OrigenAutomatico, Responsable } from '@domain/index';
import type { IArchivoService } from '@application/ports/index';
import { crearInstanciaKnex } from './db/knexInstance';
import { RutasDataLake } from './parquet/RutasDataLake';
import {
  AdjuntoRepositoryKnex, AliasDesagregacionOrigenRepositoryKnex, AtributoRepositoryKnex,
  AuditoriaRepositoryKnex, AutomatizacionIndicadorRepositoryKnex, CatalogoRepositoryKnex,
  IndicadorRepositoryKnex, ListaRepositoryKnex, MetaRepositoryKnex, ReglaRepositoryKnex,
  ResultadoRepositoryKnex, SesionRepositoryKnex, UsuarioRepositoryKnex,
  crearRepositorioDefinicionesPeriodicidad, crearRepositorioEquipos, crearRepositorioOrigenesAutomaticos
} from './repositories/RepositoriosKnex';
import { aCategoria, aResponsable, deCategoria, deResponsable } from './repositories/mapeos';
import { ConfiguracionRepositoryJson } from './repositories/ConfiguracionRepositoryJson';
import { ExportAnaliticoService } from './export/ExportAnaliticoService';
import { ConfigPortableService } from './config-portable/ConfigPortableService';
import { RespaldoPerfilService } from './perfiles/RespaldoPerfilService';
import { GeneradorUuid, RelojSistema } from './soporte/servicios';
import { ArchivoServiceWeb } from './soporte/ArchivoServiceWeb';
import { ConectorOrigenFactory } from './conectores/ConectorOrigenFactory';

export interface Infraestructura {
  knex: Knex;
  rutas: RutasDataLake;
  reloj: RelojSistema;
  ids: GeneradorUuid;
  configuracion: ConfiguracionRepositoryJson;
  indicadores: IndicadorRepositoryKnex;
  atributos: AtributoRepositoryKnex;
  listas: ListaRepositoryKnex;
  metas: MetaRepositoryKnex;
  reglas: ReglaRepositoryKnex;
  periodicidades: CatalogoRepositoryKnex<DefinicionPeriodicidad>;
  responsables: CatalogoRepositoryKnex<Responsable>;
  categorias: CatalogoRepositoryKnex<Categoria>;
  equipos: CatalogoRepositoryKnex<Equipo>;
  origenesAutomaticos: CatalogoRepositoryKnex<OrigenAutomatico>;
  automatizaciones: AutomatizacionIndicadorRepositoryKnex;
  aliasDesagregacionOrigen: AliasDesagregacionOrigenRepositoryKnex;
  conectorOrigen: ConectorOrigenFactory;
  resultados: ResultadoRepositoryKnex;
  adjuntos: AdjuntoRepositoryKnex;
  auditoria: AuditoriaRepositoryKnex;
  usuarios: UsuarioRepositoryKnex;
  sesiones: SesionRepositoryKnex;
  exportacion: ExportAnaliticoService;
  configPortable: ConfigPortableService;
  respaldoPerfil: RespaldoPerfilService;
  archivos: IArchivoService;
  cerrar(): Promise<void>;
}

export interface OpcionesInfraestructura {
  /** Versión de la app (p. ej. `app.getVersion()`), incluida en los respaldos exportados. */
  appVersion?: string;
  /**
   * Fábrica de `IArchivoService` — por defecto `ArchivoServiceWeb`. Desde
   * la Fase 4 (retiro de Electron) el único consumidor de
   * `crearInfraestructura` es `src/server/composicionServidor.ts`, que
   * nunca la sobrescribe; se mantiene como punto de extensión explícito en
   * vez de instanciar `ArchivoServiceWeb` directamente, por si un futuro
   * entorno (worker, CLI de administración) necesita otra implementación.
   */
  crearArchivos?: (rutas: RutasDataLake) => IArchivoService;
}

/**
 * Composition root de la infraestructura: crea el Data Lake local (para
 * adjuntos y la exportación analítica — ver ExportAnaliticoService),
 * abre la conexión Knex (SQLite local o SQL Server, según `DB_CLIENT`),
 * aplica las migraciones pendientes y cablea los repositorios. Es la única
 * función que conoce implementaciones concretas.
 */
export async function crearInfraestructura(
  dataDir: string,
  opciones: OpcionesInfraestructura = {}
): Promise<Infraestructura> {
  const rutas = new RutasDataLake(dataDir);
  rutas.crearDirectorios();

  const knex = await crearInstanciaKnex({ dataDir });
  const configuracion = new ConfiguracionRepositoryJson(rutas);

  const indicadores = new IndicadorRepositoryKnex(knex);
  const atributos = new AtributoRepositoryKnex(knex);
  const listas = new ListaRepositoryKnex(knex);
  const metas = new MetaRepositoryKnex(knex);
  const reglas = new ReglaRepositoryKnex(knex);
  const periodicidades = crearRepositorioDefinicionesPeriodicidad(knex);
  const responsables = new CatalogoRepositoryKnex(knex, 'responsables', aResponsable, deResponsable, true);
  const categorias = new CatalogoRepositoryKnex(knex, 'categorias', aCategoria, deCategoria, true);
  const equipos = crearRepositorioEquipos(knex);
  const origenesAutomaticos = crearRepositorioOrigenesAutomaticos(knex);
  const automatizaciones = new AutomatizacionIndicadorRepositoryKnex(knex);
  const aliasDesagregacionOrigen = new AliasDesagregacionOrigenRepositoryKnex(knex);
  const conectorOrigen = new ConectorOrigenFactory((origen) => origenesAutomaticos.guardar(origen));
  const resultados = new ResultadoRepositoryKnex(knex);
  const adjuntos = new AdjuntoRepositoryKnex(knex);
  const auditoria = new AuditoriaRepositoryKnex(knex);
  const usuarios = new UsuarioRepositoryKnex(knex);
  const sesiones = new SesionRepositoryKnex(knex);
  const exportacion = new ExportAnaliticoService(knex, rutas, configuracion, periodicidades, responsables, categorias);
  const configPortable = new ConfigPortableService(
    configuracion, indicadores, atributos, listas, reglas, metas, periodicidades, responsables, categorias, equipos
  );
  const respaldoPerfil = new RespaldoPerfilService(
    {
      configuracion, indicadores, atributos, listas, metas, reglas, periodicidades, responsables, categorias, equipos,
      origenesAutomaticos, automatizaciones, aliasDesagregacionOrigen
    },
    opciones.appVersion ?? null
  );
  const archivos = (opciones.crearArchivos ?? ((r) => new ArchivoServiceWeb(r)))(rutas);

  return {
    knex,
    rutas,
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
    equipos,
    origenesAutomaticos,
    automatizaciones,
    aliasDesagregacionOrigen,
    conectorOrigen,
    resultados,
    adjuntos,
    auditoria,
    usuarios,
    sesiones,
    exportacion,
    configPortable,
    respaldoPerfil,
    archivos,
    async cerrar() {
      exportacion.cancelar();
      await knex.destroy();
    }
  };
}
