import type {
  Adjunto, AliasDesagregacionOrigen, Atributo, AutomatizacionIndicador, Categoria, DefinicionPeriodicidad,
  ConfiguracionGeneral, ElementoLista, EntidadAdjunto, Equipo, Indicador, Lista, Meta, OrigenAutomatico, ParametroDinamico,
  Periodo, RegistroAuditoria, ReglaNegocio, ResultadoHistorial, Rol
} from '@domain/index';
import type { FiltroAuditoria, ResultadoPrueba, ResultadoTabular, ValorAtributoEntidad } from '@application/ports/index';
import type { DatosCaptura, ResultadoObtencionAutomatica } from '@application/use-cases/ServicioRecoleccion';
import type {
  GuardarIndicadorInput, MapeoImportacionIndicadores, ResultadoImportacionIndicadores
} from '@application/use-cases/ServicioCatalogos';
import type { DetalleSeguimiento, FilaHistorico, FilaTablero } from '@application/use-cases/ServicioSeguimiento';
import type { ReglaFechaLimiteDisponible } from '@application/use-cases/ServicioConfiguracion';
import type { ReporteConciliacion } from '@domain/services/ConciliacionLista';
import type { ResultadoImportacionRespaldo, ResumenRespaldo, SeleccionRespaldo } from '@infrastructure/perfiles/esquemaRespaldo';

/** Filas máximas que devuelve `origenes:probarCodigo` — tope de VISUALIZACIÓN, aplicado tras ejecutar la consulta completa. */
export const LIMITE_FILAS_PRUEBA_ORIGEN = 100;

/** Resultado de "Probar código": igual que ResultadoTabular pero truncado, con el conteo real y si se recortó. */
export interface ResultadoPruebaCodigo {
  columnas: string[];
  filas: Record<string, string>[];
  totalFilas: number;
  truncado: boolean;
}

/**
 * Contrato tipado de canal→{req,res}: nació como el contrato IPC de la app
 * de escritorio, y sigue siendo el tipo que implementa
 * `Aplicacion.manejadores` (`src/composicion/manejadores.ts`) — agnóstico
 * de Electron (solo TypeScript), por eso sobrevivió a su retiro en la
 * Fase 4. También sigue tipando `invocar<C>()` en el renderer
 * (`src/renderer/src/api.ts`), aunque ahí una tabla de traducción interna
 * enruta la mayoría de los canales por tRPC — los que la Fase 3 movió a
 * rutas REST planas (`adjuntos:subir`/`abrir`, `sistema:seleccionarArchivo`/
 * `leerHojaCalculo`, `respaldo:*`, `portable:*`) siguen aquí porque
 * `Aplicacion.manejadores` y los tests de integración los siguen usando
 * directamente, pero `invocar()` los rechaza (ver `src/server/rest/`).
 * `perfiles:*` no existe (retirado en la Fase 4, espacio de trabajo único).
 */
export interface CanalesIpc {
  'config:obtener': { req: void; res: ConfiguracionGeneral };
  'config:guardar': { req: ConfiguracionGeneral; res: void };
  'config:reglasFechaLimite': { req: void; res: ReglaFechaLimiteDisponible[] };

  'indicadores:listar': { req: void; res: Indicador[] };
  'indicadores:obtener': { req: { id: string }; res: Indicador | null };
  'indicadores:guardar': { req: GuardarIndicadorInput; res: Indicador };
  'indicadores:eliminar': { req: { id: string }; res: void };
  'indicadores:reasignarMasivo': {
    req: { ids: string[]; responsable?: string | null; categoria?: string | null; equipo?: string | null };
    res: void;
  };
  'indicadores:importarExcel': {
    req: { filas: Record<string, string>[]; mapeo: MapeoImportacionIndicadores };
    res: ResultadoImportacionIndicadores;
  };

  'atributos:listar': { req: { entidad?: string; incluirEliminados?: boolean } | void; res: Atributo[] };
  'atributos:guardar': { req: Atributo; res: Atributo };
  /** Borrado lógico: rechaza (con el detalle de qué lo usa) si el atributo está en uso. */
  'atributos:eliminar': { req: { id: string }; res: void };
  'atributos:restaurar': { req: { id: string }; res: void };
  'atributos:valores': { req: { entidadTipo: string; entidadId: string }; res: ValorAtributoEntidad[] };
  'atributos:guardarValor': { req: ValorAtributoEntidad; res: void };

  'listas:listar': { req: { incluirEliminados?: boolean } | void; res: Lista[] };
  'listas:guardar': { req: Lista; res: Lista };
  /** Borrado lógico: rechaza (con el detalle de qué la usa) si la lista está en uso. */
  'listas:eliminar': { req: { id: string }; res: void };
  'listas:restaurar': { req: { id: string }; res: void };
  'listas:elementos': { req: { listaId: string }; res: ElementoLista[] };
  'listas:guardarElemento': { req: ElementoLista; res: ElementoLista };
  'listas:eliminarElemento': { req: { id: string }; res: void };

  'metas:listar': { req: { indicadorId: string }; res: Meta[] };
  'metas:guardar': { req: Meta; res: Meta };
  'metas:eliminar': { req: { id: string }; res: void };

  'reglas:listar': { req: { entidad?: string; incluirEliminados?: boolean } | void; res: ReglaNegocio[] };
  'reglas:guardar': { req: ReglaNegocio; res: ReglaNegocio };
  'reglas:eliminar': { req: { id: string }; res: void };
  'reglas:restaurar': { req: { id: string }; res: void };

  'periodicidades:listar': { req: void; res: DefinicionPeriodicidad[] };
  'periodicidades:guardar': { req: DefinicionPeriodicidad; res: DefinicionPeriodicidad };
  'periodicidades:eliminar': { req: { id: string }; res: void };

  'categorias:listar': { req: { incluirEliminados?: boolean } | void; res: Categoria[] };
  'categorias:guardar': { req: Categoria; res: Categoria };
  /** Borrado lógico: rechaza (con el detalle de qué la usa) si la categoría está en uso. */
  'categorias:eliminar': { req: { id: string }; res: void };
  'categorias:restaurar': { req: { id: string }; res: void };

  'equipos:listar': { req: { incluirEliminados?: boolean } | void; res: Equipo[] };
  'equipos:guardar': { req: Equipo; res: Equipo };
  /** Borrado lógico: rechaza (con el detalle de qué lo usa) si el equipo tiene sub-equipos, usuarios o indicadores vinculados. */
  'equipos:eliminar': { req: { id: string }; res: void };
  'equipos:restaurar': { req: { id: string }; res: void };

  'origenes:listar': { req: { incluirEliminados?: boolean } | void; res: OrigenAutomatico[] };
  'origenes:guardar': { req: OrigenAutomatico; res: OrigenAutomatico };
  /** Borrado lógico: rechaza (con el detalle de qué lo usa) si el origen está en uso. */
  'origenes:eliminar': { req: { id: string }; res: void };
  'origenes:restaurar': { req: { id: string }; res: void };
  /** Prueba la conectividad/credenciales del origen (aún no guardado o ya guardado) sin ejecutar ningún script. */
  'origenes:probar': { req: OrigenAutomatico; res: ResultadoPrueba };
  /**
   * Ejecuta de verdad un script/consulta contra el origen y devuelve una vista previa
   * del resultado (tabla o error), a diferencia de `origenes:probar` que solo valida
   * credenciales. Topeado a LIMITE_FILAS_PRUEBA_ORIGEN filas — recorte de
   * VISUALIZACIÓN aplicado después de traer el resultado completo.
   */
  'origenes:probarCodigo': { req: { origen: OrigenAutomatico; script: string }; res: ResultadoPruebaCodigo };

  'listas:aliasOrigen': { req: { listaId: string }; res: AliasDesagregacionOrigen[] };
  /** Todos los alias por origen (una fila por lista) para UN origen — usado por el generador de consultas DAX. */
  'listas:aliasPorOrigen': { req: { origenAutomaticoId: string }; res: AliasDesagregacionOrigen[] };
  'listas:guardarAliasOrigen': { req: AliasDesagregacionOrigen; res: AliasDesagregacionOrigen };
  'listas:eliminarAliasOrigen': { req: { id: string }; res: void };

  'automatizacion:obtener': { req: { indicadorId: string }; res: AutomatizacionIndicador | null };
  'automatizacion:guardar': { req: AutomatizacionIndicador; res: AutomatizacionIndicador };
  'automatizacion:eliminar': { req: { indicadorId: string }; res: void };
  'automatizacion:ejecutarPrueba': {
    req: {
      indicadorId: string; periodoId: string; origenAutomaticoId: string;
      parametrosDinamicos: ParametroDinamico[]; script: string;
    };
    res: ResultadoTabular;
  };
  'automatizacion:validarColumna': { req: { listaId: string; valoresUnicos: string[] }; res: ReporteConciliacion };
  'automatizacion:agregarElementosFaltantes': { req: { listaId: string; nombres: string[] }; res: ElementoLista[] };

  'recoleccion:periodos': { req: { indicadorId: string }; res: Periodo[] };
  'recoleccion:captura': { req: { indicadorId: string; periodoId: string }; res: DatosCaptura };
  'recoleccion:guardarCelda': {
    req: { indicadorId: string; periodoId: string; claveDesagregacion: string; valorCrudo: string; observacion?: string | null };
    res: { valor: number | null; advertencias: string[] };
  };
  'recoleccion:fechaCorte': { req: { indicadorId: string; periodoId: string; fechaCorte: string | null }; res: void };
  'recoleccion:comentario': { req: { indicadorId: string; periodoId: string; comentario: string | null }; res: void };
  'recoleccion:exclusion': { req: { indicadorId: string; periodoId: string; listaId: string; excluir: boolean }; res: void };
  'recoleccion:historial': {
    req: { indicadorId: string; periodoId: string; claveDesagregacion: string };
    res: ResultadoHistorial[];
  };
  'recoleccion:restaurarVersion': {
    req: { indicadorId: string; periodoId: string; claveDesagregacion: string; version: number };
    res: { valor: number | null; advertencias: string[] };
  };
  /** Ejecuta el script del origen configurado y escribe las celdas que su mapeo permite determinar sin ambigüedad. */
  'recoleccion:obtenerAutomatico': { req: { indicadorId: string; periodoId: string }; res: ResultadoObtencionAutomatica };
  /** Marca un resultado ya registrado como Validado/Rechazado (Batch T) — capa de aprobación post-registro, no bloquea la captura. */
  'recoleccion:validar': { req: { indicadorId: string; periodoId: string; claveDesagregacion: string; comentario?: string | null }; res: void };
  'recoleccion:rechazar': { req: { indicadorId: string; periodoId: string; claveDesagregacion: string; comentario?: string | null }; res: void };

  'seguimiento:tablero': { req: void; res: FilaTablero[] };
  'seguimiento:detalle': { req: { indicadorId: string }; res: DetalleSeguimiento | null };
  'seguimiento:historico': { req: void; res: FilaHistorico[] };

  'exportacion:regenerar': { req: void; res: { ruta: string } };
  'exportacion:ruta': { req: void; res: { ruta: string } };

  'auditoria:consultar': { req: FiltroAuditoria; res: RegistroAuditoria[] };

  'roles:listar': { req: void; res: Rol[] };
  'roles:guardar': { req: Rol; res: Rol };
  /** Rechaza (bloqueado) si el rol es del sistema o algún usuario lo referencia. */
  'roles:eliminar': { req: { id: string }; res: void };

  'portable:exportar': { req: void; res: { json: string } };
  'portable:importar': { req: { json: string }; res: { advertencias: string[] } };

  /** Respaldo/importación selectiva sobre el espacio de trabajo compartido (complementa, sin reemplazar, `portable:*`). */
  'respaldo:exportar': { req: void; res: { ruta: string | null } };
  /** Solo tiene sentido en el composition root de escritorio (diálogo nativo) — en la web, ver `POST /api/respaldo/leer`. */
  'respaldo:seleccionar': { req: void; res: { ruta: string; resumen: ResumenRespaldo } | null };
  'respaldo:importar': { req: { ruta: string; seleccion: SeleccionRespaldo }; res: ResultadoImportacionRespaldo };

  'tipos:listar': { req: void; res: Array<{ tipo: string; etiqueta: string; editorHint: string }> };

  'adjuntos:listar': { req: { entidad: EntidadAdjunto; entidadId: string }; res: Adjunto[] };
  /** Solo tiene sentido en el composition root de escritorio (diálogo nativo) — en la web, ver `POST /api/adjuntos`. */
  'adjuntos:subir': { req: { entidad: EntidadAdjunto; entidadId: string; comentario?: string | null }; res: Adjunto | null };
  'adjuntos:abrir': { req: { id: string }; res: void };
  'adjuntos:eliminar': { req: { id: string }; res: void };

  /** Solo tiene sentido en el composition root de escritorio (diálogo nativo) — en la web, ver `POST /api/importacion/hoja-calculo`. */
  'sistema:seleccionarArchivo': {
    req: { filtros?: { nombre: string; extensiones: string[] }[] } | void;
    res: string | null;
  };
  'sistema:leerHojaCalculo': { req: { rutaArchivo: string }; res: { columnas: string[]; filas: Record<string, string>[] } };
  /** Metadatos estáticos de la aplicación (versión, autor, soporte) para la sección "Acerca de". */
  'sistema:info': {
    req: void;
    res: { nombre: string; version: string; autor: string; licencia: string; urlSoporte: string; electron: string; node: string; chrome: string };
  };
}

export type NombreCanal = keyof CanalesIpc;

/** `sistema:info` no pasa por `Aplicacion.manejadores` (no depende de infraestructura) — tiene su propio procedimiento en `sistemaRouter`. */
export type CanalLocal = 'sistema:info';
