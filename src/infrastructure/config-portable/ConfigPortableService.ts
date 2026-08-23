import { z } from 'zod';
import type {
  IAtributoRepository, ICatalogoRepository, IConfigPortableService, IConfiguracionRepository,
  IListaRepository, IMetaRepository, IIndicadorRepository, IReglaRepository, IRolRepository
} from '@application/ports/index';
import type { Categoria, DefinicionPeriodicidad, Equipo, Responsable } from '@domain/index';
import { CONFIG_SCHEMA_VERSION } from '@domain/index';

/**
 * Exportación/importación de TODA la configuración en un único JSON
 * versionado: indicadores, atributos, listas, reglas, desagregaciones
 * (dentro de cada indicador), metas, periodicidades personalizadas,
 * catálogos (responsables/categorías/equipos), roles (Batch T) y parámetros
 * generales. Deliberadamente NO incluye `usuarios` (ni antes de Batch T ni
 * ahora): contienen `passwordHash` y son datos de identidad de ESTE
 * despliegue, no configuración de negocio portable entre instalaciones.
 *
 * Estrategia de migración: `migraciones` es una cadena v(n) -> v(n+1);
 * al importar un archivo antiguo se aplican en orden hasta la versión
 * actual. Agregar una versión nueva = añadir un paso, sin tocar los
 * anteriores. Las secciones nuevas se declaran opcionales en el esquema
 * de parseo para que un archivo v1 auténtico (sin esas claves) siga
 * siendo válido de leer; es la migración la que las completa.
 */

const esquemaArchivo = z.object({
  formato: z.literal('kpitracker-config'),
  schemaVersion: z.number().int().positive(),
  exportadoEn: z.string(),
  configuracionGeneral: z.record(z.unknown()),
  indicadores: z.array(z.record(z.unknown())),
  atributos: z.array(z.record(z.unknown())),
  listas: z.array(z.record(z.unknown())),
  elementos: z.array(z.record(z.unknown())),
  reglas: z.array(z.record(z.unknown())),
  metas: z.array(z.record(z.unknown())),
  periodicidades: z.array(z.record(z.unknown())).optional(),
  responsables: z.array(z.record(z.unknown())).optional(),
  categorias: z.array(z.record(z.unknown())).optional(),
  equipos: z.array(z.record(z.unknown())).optional(),
  roles: z.array(z.record(z.unknown())).optional()
});

type ArchivoConfig = z.infer<typeof esquemaArchivo>;

/**
 * Migraciones encadenables de versión de esquema (v -> v+1).
 * v1 -> v2: se agregan las secciones de periodicidades personalizadas y
 * catálogos (responsables/categorías); un archivo v1 no las trae, por lo
 * que se completan con arreglos vacíos.
 * v2 -> v3 (Batch R/S): se agrega la sección de equipos; `Categoria.padreId`/
 * `prefijo` y `Responsable.equipoId` ya viajaban tal cual dentro de sus
 * respectivos arreglos (son campos del objeto de dominio serializado
 * completo, no requieren su propio paso de migración) — solo el arreglo
 * `equipos`, nuevo por completo, necesita completarse con uno vacío.
 * v3 -> v4 (Batch T): se agrega la sección de roles (nombre + permisos, sin
 * datos de usuarios/contraseñas — esos deliberadamente nunca viajan en la
 * configuración portable, ver docstring de la clase).
 */
const migraciones: Record<number, (archivo: ArchivoConfig) => ArchivoConfig> = {
  1: (archivo) => ({
    ...archivo,
    schemaVersion: 2,
    periodicidades: archivo.periodicidades ?? [],
    responsables: archivo.responsables ?? [],
    categorias: archivo.categorias ?? []
  }),
  2: (archivo) => ({
    ...archivo,
    schemaVersion: 3,
    equipos: archivo.equipos ?? []
  }),
  3: (archivo) => ({
    ...archivo,
    schemaVersion: 4,
    roles: archivo.roles ?? []
  })
};

export class ConfigPortableService implements IConfigPortableService {
  constructor(
    private readonly configuracion: IConfiguracionRepository,
    private readonly indicadores: IIndicadorRepository,
    private readonly atributos: IAtributoRepository,
    private readonly listas: IListaRepository,
    private readonly reglas: IReglaRepository,
    private readonly metas: IMetaRepository,
    private readonly periodicidades: ICatalogoRepository<DefinicionPeriodicidad>,
    private readonly responsables: ICatalogoRepository<Responsable>,
    private readonly categorias: ICatalogoRepository<Categoria>,
    private readonly equipos: ICatalogoRepository<Equipo>,
    private readonly roles: IRolRepository
  ) {}

  async exportar(): Promise<string> {
    const [config, indicadores, atributos, listas, reglas, periodicidades, responsables, categorias, equipos, roles] = await Promise.all([
      this.configuracion.obtener(),
      this.indicadores.listar(),
      this.atributos.listar(),
      this.listas.listar(),
      this.reglas.listar(),
      this.periodicidades.listar(),
      this.responsables.listar(),
      this.categorias.listar(),
      this.equipos.listar(),
      this.roles.listar()
    ]);
    const elementos = (
      await Promise.all(listas.map((l) => this.listas.listarElementos(l.id)))
    ).flat();
    const metas = (
      await Promise.all(indicadores.map((i) => this.metas.listarPorIndicador(i.id)))
    ).flat();

    const archivo: ArchivoConfig = {
      formato: 'kpitracker-config',
      schemaVersion: CONFIG_SCHEMA_VERSION,
      exportadoEn: new Date().toISOString(),
      configuracionGeneral: config as unknown as Record<string, unknown>,
      indicadores: indicadores as unknown as Record<string, unknown>[],
      atributos: atributos as unknown as Record<string, unknown>[],
      listas: listas as unknown as Record<string, unknown>[],
      elementos: elementos as unknown as Record<string, unknown>[],
      reglas: reglas as unknown as Record<string, unknown>[],
      metas: metas as unknown as Record<string, unknown>[],
      periodicidades: periodicidades as unknown as Record<string, unknown>[],
      responsables: responsables as unknown as Record<string, unknown>[],
      categorias: categorias as unknown as Record<string, unknown>[],
      equipos: equipos as unknown as Record<string, unknown>[],
      roles: roles as unknown as Record<string, unknown>[]
    };
    return JSON.stringify(archivo, null, 2);
  }

  async importar(json: string): Promise<{ advertencias: string[] }> {
    const advertencias: string[] = [];
    let archivo = esquemaArchivo.parse(JSON.parse(json));

    if (archivo.schemaVersion > CONFIG_SCHEMA_VERSION) {
      throw new Error(
        `El archivo es de una versión más nueva (${archivo.schemaVersion}) que esta aplicación (${CONFIG_SCHEMA_VERSION}).`
      );
    }
    while (archivo.schemaVersion < CONFIG_SCHEMA_VERSION) {
      const migrar = migraciones[archivo.schemaVersion];
      if (!migrar) {
        throw new Error(`No existe migración desde la versión ${archivo.schemaVersion}.`);
      }
      archivo = migrar(archivo);
      advertencias.push(`Configuración migrada a la versión ${archivo.schemaVersion}.`);
    }

    // La importación reemplaza/actualiza por id (upsert); no borra lo no incluido.
    await this.configuracion.guardar(archivo.configuracionGeneral as never);
    for (const lista of archivo.listas) await this.listas.guardar(lista as never);
    for (const elemento of archivo.elementos) await this.listas.guardarElemento(elemento as never);
    for (const atributo of archivo.atributos) await this.atributos.guardar(atributo as never);
    for (const periodicidad of archivo.periodicidades ?? []) await this.periodicidades.guardar(periodicidad as never);
    for (const equipo of archivo.equipos ?? []) await this.equipos.guardar(equipo as never);
    for (const rol of archivo.roles ?? []) await this.roles.guardar(rol as never);
    for (const indicador of archivo.indicadores) await this.indicadores.guardar(indicador as never);
    for (const regla of archivo.reglas) await this.reglas.guardar(regla as never);
    for (const meta of archivo.metas) await this.metas.guardar(meta as never);
    for (const responsable of archivo.responsables ?? []) await this.responsables.guardar(responsable as never);
    for (const categoria of archivo.categorias ?? []) await this.categorias.guardar(categoria as never);

    return { advertencias };
  }
}
