import { z } from 'zod';

/**
 * Formato de respaldo de un perfil completo (Batch N) — deliberadamente
 * distinto de `kpitracker-config` (config-portable, ver
 * `ConfigPortableService.ts`, que no se toca en ningún lote): el respaldo
 * cubre TODO lo que config-portable no cubre (orígenes automáticos,
 * automatizaciones de indicador, alias de desagregación) e incluye
 * borrados lógicos (`eliminado`) para que el respaldo sea fiel al estado
 * real del perfil.
 */
export const RESPALDO_FORMATO = 'kpitracker-respaldo-perfil';
export const RESPALDO_SCHEMA_VERSION = 2;

/**
 * Categorías seleccionables al importar. `elementos` (hijos de listas) NO
 * es una categoría propia: sigue a su lista — un elemento solo se importa
 * si su lista está seleccionada — evitando huérfanos.
 */
export type CategoriaRespaldo =
  | 'configuracionGeneral'
  | 'periodicidades'
  | 'responsables'
  | 'categorias'
  | 'equipos'
  | 'listas'
  | 'atributos'
  | 'origenes'
  | 'indicadores'
  | 'metas'
  | 'reglas'
  | 'automatizaciones'
  | 'aliasDesagregacion';

/**
 * Orden de importación: primero lo que otras categorías referencian
 * (catálogos, listas, atributos, orígenes) y al final lo que depende de
 * varias de ellas (metas, automatizaciones, alias). `equipos` va antes de
 * `responsables` (que referencian `equipoId`) e `indicadores` (que
 * referencian `equipo` directo).
 */
export const ORDEN_IMPORTACION: CategoriaRespaldo[] = [
  'configuracionGeneral', 'periodicidades', 'equipos', 'responsables', 'categorias',
  'listas', 'atributos', 'origenes', 'indicadores', 'metas', 'reglas', 'automatizaciones', 'aliasDesagregacion'
];

export const ETIQUETAS_CATEGORIA: Record<CategoriaRespaldo, string> = {
  configuracionGeneral: 'Configuración general',
  periodicidades: 'Periodicidades personalizadas',
  responsables: 'Responsables',
  categorias: 'Categorías',
  equipos: 'Equipos',
  listas: 'Listas de selección',
  atributos: 'Atributos',
  origenes: 'Orígenes automáticos',
  indicadores: 'Indicadores',
  metas: 'Metas',
  reglas: 'Reglas de negocio',
  automatizaciones: 'Automatizaciones de indicador',
  aliasDesagregacion: 'Alias de desagregación por origen'
};

export const esquemaRespaldo = z.object({
  formato: z.literal(RESPALDO_FORMATO),
  schemaVersion: z.number().int().positive(),
  exportadoEn: z.string(),
  appVersion: z.string().optional(),
  configuracionGeneral: z.record(z.unknown()),
  periodicidades: z.array(z.record(z.unknown())).default([]),
  responsables: z.array(z.record(z.unknown())).default([]),
  categorias: z.array(z.record(z.unknown())).default([]),
  equipos: z.array(z.record(z.unknown())).default([]),
  listas: z.array(z.record(z.unknown())).default([]),
  /** Hijos de listas — no es categoría de selección propia, ver `ORDEN_IMPORTACION`. */
  elementos: z.array(z.record(z.unknown())).default([]),
  atributos: z.array(z.record(z.unknown())).default([]),
  origenes: z.array(z.record(z.unknown())).default([]),
  indicadores: z.array(z.record(z.unknown())).default([]),
  metas: z.array(z.record(z.unknown())).default([]),
  reglas: z.array(z.record(z.unknown())).default([]),
  automatizaciones: z.array(z.record(z.unknown())).default([]),
  aliasDesagregacion: z.array(z.record(z.unknown())).default([])
});

export type ArchivoRespaldo = z.infer<typeof esquemaRespaldo>;

/**
 * Migraciones encadenables de versión de esquema (v -> v+1); vacío en v1.
 * v1 -> v2 (Batch S): se agrega la categoría `equipos` — el `.default([])`
 * de Zod ya la completa al parsear un respaldo v1 (no trae la clave), así
 * que el único paso real es avanzar el número de versión.
 */
export const migracionesRespaldo: Record<number, (archivo: ArchivoRespaldo) => ArchivoRespaldo> = {
  1: (archivo) => ({ ...archivo, schemaVersion: 2 })
};

/**
 * Qué categorías importar y, dentro de cada una, qué ítems puntuales:
 * `'todos'` trae toda la categoría; un arreglo de ids trae solo esos
 * ítems; la ausencia de la clave significa "no importar" (fail-closed —
 * desmarcar una categoría en la UI la excluye por completo).
 */
export type SeleccionRespaldo = Partial<Record<CategoriaRespaldo, 'todos' | string[]>>;

/** Ítem individual mostrado en el selector de importación granular. */
export interface ItemRespaldo {
  id: string;
  nombre: string;
  detalle?: string;
}

export interface CategoriaResumen {
  categoria: CategoriaRespaldo;
  etiqueta: string;
  items: ItemRespaldo[];
  total: number;
  /** `true` para `configuracionGeneral`: no tiene ítems individuales, es todo o nada. */
  atomica: boolean;
}

export interface ResumenRespaldo {
  schemaVersion: number;
  exportadoEn: string;
  appVersion: string | null;
  categorias: CategoriaResumen[];
}

export interface ResultadoImportacionRespaldo {
  advertencias: string[];
  importados: Record<CategoriaRespaldo, number>;
  omitidos: Record<CategoriaRespaldo, number>;
}
