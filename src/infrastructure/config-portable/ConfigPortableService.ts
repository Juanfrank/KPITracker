import { z } from 'zod';
import type {
  IAtributoRepository, IConfigPortableService, IConfiguracionRepository,
  IListaRepository, IMetaRepository, IIndicadorRepository, IReglaRepository
} from '@application/ports/index';
import { CONFIG_SCHEMA_VERSION } from '@domain/index';

/**
 * Exportación/importación de TODA la configuración en un único JSON
 * versionado: indicadores, atributos, listas, reglas, desagregaciones
 * (dentro de cada indicador), metas y parámetros generales.
 *
 * Estrategia de migración: `migraciones` es una cadena v(n) -> v(n+1);
 * al importar un archivo antiguo se aplican en orden hasta la versión
 * actual. Agregar una versión nueva = añadir un paso, sin tocar los
 * anteriores.
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
  metas: z.array(z.record(z.unknown()))
});

type ArchivoConfig = z.infer<typeof esquemaArchivo>;

/** Migraciones encadenables de versión de esquema (v -> v+1). */
const migraciones: Record<number, (archivo: ArchivoConfig) => ArchivoConfig> = {
  // Ejemplo futuro: 1: (a) => ({ ...a, schemaVersion: 2, nuevoCampo: [] })
};

export class ConfigPortableService implements IConfigPortableService {
  constructor(
    private readonly configuracion: IConfiguracionRepository,
    private readonly indicadores: IIndicadorRepository,
    private readonly atributos: IAtributoRepository,
    private readonly listas: IListaRepository,
    private readonly reglas: IReglaRepository,
    private readonly metas: IMetaRepository
  ) {}

  async exportar(): Promise<string> {
    const [config, indicadores, atributos, listas, reglas] = await Promise.all([
      this.configuracion.obtener(),
      this.indicadores.listar(),
      this.atributos.listar(),
      this.listas.listar(),
      this.reglas.listar()
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
      metas: metas as unknown as Record<string, unknown>[]
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
    for (const indicador of archivo.indicadores) await this.indicadores.guardar(indicador as never);
    for (const regla of archivo.reglas) await this.reglas.guardar(regla as never);
    for (const meta of archivo.metas) await this.metas.guardar(meta as never);

    return { advertencias };
  }
}
