import type {
  Adjunto,
  Atributo,
  Categoria,
  ConfiguracionGeneral,
  DefinicionPeriodicidad,
  ElementoLista,
  EntidadAdjunto,
  Indicador,
  Levantamiento,
  Lista,
  Meta,
  RegistroAuditoria,
  ReglaNegocio,
  Responsable,
  Resultado,
  ResultadoHistorial
} from '@domain/index';

/**
 * Puertos (Repository Pattern): la lógica de negocio solo conoce estas
 * interfaces; ningún módulo accede al almacenamiento físico directamente.
 * Reemplazar el motor (DuckDB/Parquet) por otro solo requiere nuevas
 * implementaciones de estos puertos.
 */

export interface IClock {
  /** Fecha actual ISO yyyy-MM-dd (local). */
  hoyIso(): string;
  /** Instante actual ISO 8601 completo. */
  ahoraIso(): string;
}

export interface IIdGenerator {
  nuevoId(): string;
}

export interface IConfiguracionRepository {
  obtener(): Promise<ConfiguracionGeneral>;
  guardar(config: ConfiguracionGeneral): Promise<void>;
}

export interface IIndicadorRepository {
  listar(): Promise<Indicador[]>;
  obtener(id: string): Promise<Indicador | null>;
  /** Busca un indicador por código único (excluyendo opcionalmente un id, para validar en edición). */
  buscarPorCodigo(codigo: string, excluirId?: string): Promise<Indicador | null>;
  guardar(indicador: Indicador): Promise<void>;
  eliminar(id: string): Promise<void>;
}

export interface ValorAtributoEntidad {
  atributoId: string;
  entidadTipo: string;
  entidadId: string;
  valorTexto: string | null;
  valorNumero: number | null;
  valorFecha: string | null;
  valorBooleano: boolean | null;
}

export interface IAtributoRepository {
  listar(entidad?: string): Promise<Atributo[]>;
  obtener(id: string): Promise<Atributo | null>;
  guardar(atributo: Atributo): Promise<void>;
  eliminar(id: string): Promise<void>;
  obtenerValores(entidadTipo: string, entidadId: string): Promise<ValorAtributoEntidad[]>;
  guardarValor(valor: ValorAtributoEntidad): Promise<void>;
}

export interface IListaRepository {
  listar(): Promise<Lista[]>;
  obtener(id: string): Promise<Lista | null>;
  guardar(lista: Lista): Promise<void>;
  eliminar(id: string): Promise<void>;
  listarElementos(listaId: string): Promise<ElementoLista[]>;
  guardarElemento(elemento: ElementoLista): Promise<void>;
  eliminarElemento(id: string): Promise<void>;
}

export interface IMetaRepository {
  listarPorIndicador(indicadorId: string): Promise<Meta[]>;
  guardar(meta: Meta): Promise<void>;
  eliminar(id: string): Promise<void>;
}

export interface IReglaRepository {
  listar(entidad?: string): Promise<ReglaNegocio[]>;
  guardar(regla: ReglaNegocio): Promise<void>;
  eliminar(id: string): Promise<void>;
}

export interface IDefinicionPeriodicidadRepository {
  listar(): Promise<DefinicionPeriodicidad[]>;
  obtener(id: string): Promise<DefinicionPeriodicidad | null>;
  guardar(definicion: DefinicionPeriodicidad): Promise<void>;
  eliminar(id: string): Promise<void>;
}

/** Catálogo simple (CRUD homogéneo); implementado por un único repositorio genérico en infraestructura. */
export interface ICatalogoRepository<T extends { readonly id: string }> {
  listar(): Promise<T[]>;
  obtener(id: string): Promise<T | null>;
  guardar(item: T): Promise<void>;
  eliminar(id: string): Promise<void>;
}

export type IResponsableRepository = ICatalogoRepository<Responsable>;
export type ICategoriaRepository = ICatalogoRepository<Categoria>;

/** Resumen por período para el tablero de seguimiento. */
export interface ResumenPeriodo {
  indicadorId: string;
  periodoId: string;
  combinacionesConValor: number;
  ultimaActualizacion: string | null;
}

export interface IResultadoRepository {
  obtenerPorIndicadorPeriodo(indicadorId: string, periodoId: string): Promise<Resultado[]>;
  guardar(resultado: Resultado): Promise<void>;
  obtenerLevantamiento(indicadorId: string, periodoId: string): Promise<Levantamiento | null>;
  listarLevantamientos(indicadorId?: string): Promise<Levantamiento[]>;
  guardarLevantamiento(levantamiento: Levantamiento): Promise<void>;
  resumenPorIndicador(indicadorId: string): Promise<ResumenPeriodo[]>;
  resumenGlobal(): Promise<ResumenPeriodo[]>;
  /** Historial de versiones de una celda, más reciente primero. */
  obtenerHistorial(indicadorId: string, periodoId: string, claveDesagregacion: string): Promise<ResultadoHistorial[]>;
  /** Agrega una entrada de versión (append-only, nunca se sobrescribe). */
  registrarVersion(entrada: ResultadoHistorial): Promise<void>;
}

export interface FiltroAuditoria {
  entidad?: string;
  entidadId?: string;
  desde?: string;
  hasta?: string;
  limite?: number;
}

export interface IAuditoriaRepository {
  registrar(registro: RegistroAuditoria): Promise<void>;
  consultar(filtro: FiltroAuditoria): Promise<RegistroAuditoria[]>;
}

export interface IExportService {
  /** Regenera la capa analítica desnormalizada (Parquet y CSV opcional). */
  regenerar(): Promise<void>;
  /** Solicita regeneración diferida (debounce) tras una escritura. */
  solicitarRegeneracion(): void;
  /** Ruta del directorio de exportación, para mostrar en la UI. */
  rutaExportacion(): string;
}

export interface IConfigPortableService {
  exportar(): Promise<string>;
  importar(json: string): Promise<{ advertencias: string[] }>;
}

export interface IAdjuntoRepository {
  listarPorEntidad(entidad: EntidadAdjunto, entidadId: string): Promise<Adjunto[]>;
  obtener(id: string): Promise<Adjunto | null>;
  guardar(adjunto: Adjunto): Promise<void>;
  eliminar(id: string): Promise<void>;
}

/** Copia un archivo elegido por el usuario dentro de /Data/Adjuntos y devuelve su ruta relativa. */
export interface IArchivoService {
  guardarAdjunto(rutaOrigen: string, nombreSugerido: string): Promise<{ rutaRelativa: string; tamanioBytes: number }>;
  rutaAbsoluta(rutaRelativa: string): string;
  eliminarArchivo(rutaRelativa: string): Promise<void>;
  abrir(rutaRelativa: string): Promise<void>;
  /** Abre un diálogo nativo de selección de archivo; null si el usuario cancela. */
  seleccionarArchivo(filtros?: { nombre: string; extensiones: string[] }[]): Promise<string | null>;
  /** Lee un archivo de hoja de cálculo (xlsx/xls/csv) y devuelve columnas + filas de la primera pestaña. */
  leerHojaCalculo(rutaArchivo: string): Promise<{ columnas: string[]; filas: Record<string, string>[] }>;
}
