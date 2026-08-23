import type {
  Adjunto,
  AliasDesagregacionOrigen,
  Atributo,
  AutomatizacionIndicador,
  Categoria,
  ConfiguracionGeneral,
  DefinicionPeriodicidad,
  ElementoLista,
  EntidadAdjunto,
  Indicador,
  Levantamiento,
  Lista,
  Meta,
  OrigenAutomatico,
  RegistroAuditoria,
  ReglaNegocio,
  Responsable,
  Resultado,
  ResultadoHistorial,
  Sesion,
  Usuario
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
  listar(entidad?: string, incluirEliminados?: boolean): Promise<Atributo[]>;
  obtener(id: string): Promise<Atributo | null>;
  guardar(atributo: Atributo): Promise<void>;
  /** Marca (o desmarca) el borrado lógico: distinto del hard-delete, que se retiró para esta entidad. */
  marcarEliminado(id: string, eliminado: boolean): Promise<void>;
  obtenerValores(entidadTipo: string, entidadId: string): Promise<ValorAtributoEntidad[]>;
  guardarValor(valor: ValorAtributoEntidad): Promise<void>;
  /** Entidades con un valor capturado para este atributo — usado por la verificación de referencias antes de eliminar. */
  listarEntidadesConValor(atributoId: string): Promise<ValorAtributoEntidad[]>;
}

export interface IListaRepository {
  listar(incluirEliminados?: boolean): Promise<Lista[]>;
  obtener(id: string): Promise<Lista | null>;
  guardar(lista: Lista): Promise<void>;
  /** Marca (o desmarca) el borrado lógico: distinto del hard-delete, que se retiró para esta entidad. */
  marcarEliminado(id: string, eliminado: boolean): Promise<void>;
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
  listar(entidad?: string, incluirEliminados?: boolean): Promise<ReglaNegocio[]>;
  obtener(id: string): Promise<ReglaNegocio | null>;
  guardar(regla: ReglaNegocio): Promise<void>;
  /** Marca (o desmarca) el borrado lógico: distinto del hard-delete, que se retiró para esta entidad. */
  marcarEliminado(id: string, eliminado: boolean): Promise<void>;
}

export interface IDefinicionPeriodicidadRepository {
  listar(): Promise<DefinicionPeriodicidad[]>;
  obtener(id: string): Promise<DefinicionPeriodicidad | null>;
  guardar(definicion: DefinicionPeriodicidad): Promise<void>;
  eliminar(id: string): Promise<void>;
}

/**
 * Catálogo simple (CRUD homogéneo) que soporta borrado lógico; implementado
 * por `CatalogoRepositoryDuckDb` en infraestructura con `soportaEliminado:
 * true`. `periodicidades_personalizadas` sigue con hard-delete (interfaz
 * separada `IDefinicionPeriodicidadRepository`), fuera de esta.
 */
export interface ICatalogoRepository<T extends { readonly id: string }> {
  listar(incluirEliminados?: boolean): Promise<T[]>;
  obtener(id: string): Promise<T | null>;
  guardar(item: T): Promise<void>;
  /** Marca (o desmarca) el borrado lógico: distinto del hard-delete, que se retiró para esta entidad. */
  marcarEliminado(id: string, eliminado: boolean): Promise<void>;
}

export type IResponsableRepository = ICatalogoRepository<Responsable>;
export type ICategoriaRepository = ICatalogoRepository<Categoria>;
export type IOrigenAutomaticoRepository = ICatalogoRepository<OrigenAutomatico>;

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
  /** Valor GENERAL (sin desagregar) de cada período con datos, para el histórico de Seguimiento. */
  resultadosGeneralPorIndicador(indicadorId: string): Promise<Array<{ periodoId: string; valor: number | null }>>;
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

export interface IAutomatizacionIndicadorRepository {
  obtenerPorIndicador(indicadorId: string): Promise<AutomatizacionIndicador | null>;
  /** Todas las automatizaciones configuradas, sin filtrar por indicador — usado por la verificación de referencias y el respaldo. */
  listarTodas(): Promise<AutomatizacionIndicador[]>;
  guardar(config: AutomatizacionIndicador): Promise<void>;
  eliminar(indicadorId: string): Promise<void>;
}

export interface IAliasDesagregacionOrigenRepository {
  listarPorLista(listaId: string): Promise<AliasDesagregacionOrigen[]>;
  listarPorOrigen(origenAutomaticoId: string): Promise<AliasDesagregacionOrigen[]>;
  /** Todos los alias registrados, sin filtrar — usado por el respaldo. */
  listarTodos(): Promise<AliasDesagregacionOrigen[]>;
  obtener(listaId: string, origenAutomaticoId: string): Promise<AliasDesagregacionOrigen | null>;
  guardar(alias: AliasDesagregacionOrigen): Promise<void>;
  eliminar(id: string): Promise<void>;
}

export interface IUsuarioRepository {
  listar(): Promise<Usuario[]>;
  obtener(id: string): Promise<Usuario | null>;
  obtenerPorNombreUsuario(nombreUsuario: string): Promise<Usuario | null>;
  guardar(usuario: Usuario): Promise<void>;
}

export interface ISesionRepository {
  obtener(id: string): Promise<Sesion | null>;
  guardar(sesion: Sesion): Promise<void>;
  eliminar(id: string): Promise<void>;
}

/**
 * Verifica credenciales y devuelve la identidad autenticada, o `null`. Es el
 * único punto de enganche para reemplazar la autenticación por contraseña
 * (`ProveedorPassword`, hoy la única implementación) por Azure AD/Entra ID
 * más adelante (un futuro `ProveedorOidc`) sin tocar `ServicioAutenticacion`
 * ni el resto del andamiaje de sesión/roles.
 */
export interface IAuthProvider {
  autenticar(nombreUsuario: string, password: string): Promise<{ id: string; rol: Usuario['rol'] } | null>;
}

/** Separado de `IAuthProvider` porque hashear (alta/cambio de contraseña) y verificar (login) son casos de uso distintos. */
export interface IPasswordHasher {
  hashear(password: string): Promise<string>;
}

/** Resultado de probar la conectividad/credenciales de un origen automático, sin ejecutar ningún script. */
export interface ResultadoPrueba {
  ok: boolean;
  mensaje: string;
}

/** Resultado tabular devuelto por la ejecución de un script contra un origen automático. */
export interface ResultadoTabular {
  columnas: string[];
  filas: Record<string, string>[];
}

/**
 * Conector de un origen automático: prueba la conexión/credenciales y
 * ejecuta un script ya con sus tokens sustituidos. Cada tipo (API/SQL/XMLA)
 * tiene una implementación concreta en infraestructura; la aplicación solo
 * conoce esta interfaz.
 */
export interface IConectorOrigen {
  probar(origen: OrigenAutomatico): Promise<ResultadoPrueba>;
  ejecutar(origen: OrigenAutomatico, script: string): Promise<ResultadoTabular>;
}

/** Copia un archivo elegido por el usuario dentro de /Data/Adjuntos y devuelve su ruta relativa. */
export interface IArchivoService {
  guardarAdjunto(rutaOrigen: string, nombreSugerido: string): Promise<{ rutaRelativa: string; tamanioBytes: number }>;
  rutaAbsoluta(rutaRelativa: string): string;
  eliminarArchivo(rutaRelativa: string): Promise<void>;
  abrir(rutaRelativa: string): Promise<void>;
  /** Abre un diálogo nativo de selección de archivo; null si el usuario cancela. */
  seleccionarArchivo(filtros?: { nombre: string; extensiones: string[] }[]): Promise<string | null>;
  /**
   * Lee un archivo de hoja de cálculo (xlsx/xls/csv) y devuelve columnas +
   * filas de la primera pestaña. `nombreOriginal` es opcional y solo hace
   * falta cuando `rutaArchivo` es un temporal sin extensión (subida web vía
   * `multer`, ver `src/server/rest/importacion.ts`) — decide csv vs xlsx.
   */
  leerHojaCalculo(rutaArchivo: string, nombreOriginal?: string): Promise<{ columnas: string[]; filas: Record<string, string>[] }>;
  /** Abre un diálogo nativo de guardado (p. ej. para exportar un respaldo); null si el usuario cancela. */
  seleccionarDestino(opciones: {
    nombreSugerido: string;
    filtros?: { nombre: string; extensiones: string[] }[];
  }): Promise<string | null>;
  escribirTexto(ruta: string, contenido: string): Promise<void>;
  leerTexto(ruta: string): Promise<string>;
}
