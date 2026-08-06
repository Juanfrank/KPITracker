import type {
  Adjunto, AliasDesagregacionOrigen, Atributo, AutomatizacionIndicador, Categoria, DefinicionPeriodicidad,
  ConfiguracionGeneral, ElementoLista, EntidadAdjunto, Indicador, Lista, Meta, OrigenAutomatico, ParametroDinamico,
  Periodo, RegistroAuditoria, ReglaNegocio, Responsable, ResultadoHistorial
} from '@domain/index';
import type { FiltroAuditoria, ResultadoPrueba, ResultadoTabular, ValorAtributoEntidad } from '@application/ports/index';
import type { DatosCaptura, ResultadoObtencionAutomatica } from '@application/use-cases/ServicioRecoleccion';
import type {
  GuardarIndicadorInput, MapeoImportacionIndicadores, ResultadoImportacionIndicadores
} from '@application/use-cases/ServicioCatalogos';
import type { DetalleSeguimiento, FilaHistorico, FilaTablero } from '@application/use-cases/ServicioSeguimiento';
import type { ReglaFechaLimiteDisponible } from '@application/use-cases/ServicioConfiguracion';
import type { ReporteConciliacion } from '@domain/services/ConciliacionLista';

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
 * Contrato IPC tipado entre renderer y main. Cada canal define su petición
 * y respuesta; el preload solo expone los canales aquí declarados.
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
    req: { ids: string[]; responsable?: string | null; categoria?: string | null };
    res: void;
  };
  'indicadores:importarExcel': {
    req: { filas: Record<string, string>[]; mapeo: MapeoImportacionIndicadores };
    res: ResultadoImportacionIndicadores;
  };

  'atributos:listar': { req: { entidad?: string } | void; res: Atributo[] };
  'atributos:guardar': { req: Atributo; res: Atributo };
  'atributos:eliminar': { req: { id: string }; res: void };
  'atributos:valores': { req: { entidadTipo: string; entidadId: string }; res: ValorAtributoEntidad[] };
  'atributos:guardarValor': { req: ValorAtributoEntidad; res: void };

  'listas:listar': { req: void; res: Lista[] };
  'listas:guardar': { req: Lista; res: Lista };
  'listas:eliminar': { req: { id: string }; res: void };
  'listas:elementos': { req: { listaId: string }; res: ElementoLista[] };
  'listas:guardarElemento': { req: ElementoLista; res: ElementoLista };
  'listas:eliminarElemento': { req: { id: string }; res: void };

  'metas:listar': { req: { indicadorId: string }; res: Meta[] };
  'metas:guardar': { req: Meta; res: Meta };
  'metas:eliminar': { req: { id: string }; res: void };

  'reglas:listar': { req: { entidad?: string } | void; res: ReglaNegocio[] };
  'reglas:guardar': { req: ReglaNegocio; res: ReglaNegocio };
  'reglas:eliminar': { req: { id: string }; res: void };

  'periodicidades:listar': { req: void; res: DefinicionPeriodicidad[] };
  'periodicidades:guardar': { req: DefinicionPeriodicidad; res: DefinicionPeriodicidad };
  'periodicidades:eliminar': { req: { id: string }; res: void };

  'responsables:listar': { req: void; res: Responsable[] };
  'responsables:guardar': { req: Responsable; res: Responsable };
  'responsables:eliminar': { req: { id: string }; res: void };

  'categorias:listar': { req: void; res: Categoria[] };
  'categorias:guardar': { req: Categoria; res: Categoria };
  'categorias:eliminar': { req: { id: string }; res: void };

  'origenes:listar': { req: void; res: OrigenAutomatico[] };
  'origenes:guardar': { req: OrigenAutomatico; res: OrigenAutomatico };
  'origenes:eliminar': { req: { id: string }; res: void };
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
  'automatizacion:agregarElementosFaltantes': { req: { listaId: string; codigos: string[] }; res: ElementoLista[] };

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

  'seguimiento:tablero': { req: void; res: FilaTablero[] };
  'seguimiento:detalle': { req: { indicadorId: string }; res: DetalleSeguimiento | null };
  'seguimiento:historico': { req: void; res: FilaHistorico[] };

  'exportacion:regenerar': { req: void; res: { ruta: string } };
  'exportacion:ruta': { req: void; res: { ruta: string } };

  'auditoria:consultar': { req: FiltroAuditoria; res: RegistroAuditoria[] };

  'portable:exportar': { req: void; res: { json: string } };
  'portable:importar': { req: { json: string }; res: { advertencias: string[] } };

  'tipos:listar': { req: void; res: Array<{ tipo: string; etiqueta: string; editorHint: string }> };

  'adjuntos:listar': { req: { entidad: EntidadAdjunto; entidadId: string }; res: Adjunto[] };
  'adjuntos:subir': { req: { entidad: EntidadAdjunto; entidadId: string; comentario?: string | null }; res: Adjunto | null };
  'adjuntos:abrir': { req: { id: string }; res: void };
  'adjuntos:eliminar': { req: { id: string }; res: void };

  'sistema:seleccionarArchivo': {
    req: { filtros?: { nombre: string; extensiones: string[] }[] } | void;
    res: string | null;
  };
  'sistema:leerHojaCalculo': { req: { rutaArchivo: string }; res: { columnas: string[]; filas: Record<string, string>[] } };
  /** Metadatos estáticos de la aplicación (versión, autor, soporte) para la sección "Acerca de". */
  'sistema:info': {
    req: void;
    res: {
      nombre: string; version: string; autor: string; licencia: string; urlSoporte: string;
      electron: string; node: string; chrome: string;
    };
  };
}

export type NombreCanal = keyof CanalesIpc;

/**
 * Canales que NO dependen de una `Aplicacion` concreta (no son por-perfil):
 * se resuelven en `src/main/index.ts` como "manejadores locales", nunca en
 * el mapa `Aplicacion.manejadores` del composition root. Mantenerlos aquí
 * permite excluirlos del tipo que exige implementar cada canal en
 * `composicion.ts`.
 */
export type CanalLocal = 'sistema:info';

export const NOMBRES_CANALES: NombreCanal[] = [
  'config:obtener', 'config:guardar', 'config:reglasFechaLimite',
  'indicadores:listar', 'indicadores:obtener', 'indicadores:guardar', 'indicadores:eliminar',
  'indicadores:reasignarMasivo', 'indicadores:importarExcel',
  'atributos:listar', 'atributos:guardar', 'atributos:eliminar', 'atributos:valores', 'atributos:guardarValor',
  'listas:listar', 'listas:guardar', 'listas:eliminar', 'listas:elementos', 'listas:guardarElemento', 'listas:eliminarElemento',
  'metas:listar', 'metas:guardar', 'metas:eliminar',
  'reglas:listar', 'reglas:guardar', 'reglas:eliminar',
  'periodicidades:listar', 'periodicidades:guardar', 'periodicidades:eliminar',
  'responsables:listar', 'responsables:guardar', 'responsables:eliminar',
  'categorias:listar', 'categorias:guardar', 'categorias:eliminar',
  'origenes:listar', 'origenes:guardar', 'origenes:eliminar', 'origenes:probar', 'origenes:probarCodigo',
  'listas:aliasOrigen', 'listas:guardarAliasOrigen', 'listas:eliminarAliasOrigen',
  'automatizacion:obtener', 'automatizacion:guardar', 'automatizacion:eliminar',
  'automatizacion:ejecutarPrueba', 'automatizacion:validarColumna', 'automatizacion:agregarElementosFaltantes',
  'recoleccion:periodos', 'recoleccion:captura', 'recoleccion:guardarCelda', 'recoleccion:fechaCorte', 'recoleccion:comentario',
  'recoleccion:exclusion', 'recoleccion:historial', 'recoleccion:restaurarVersion', 'recoleccion:obtenerAutomatico',
  'seguimiento:tablero', 'seguimiento:detalle', 'seguimiento:historico',
  'exportacion:regenerar', 'exportacion:ruta',
  'auditoria:consultar',
  'portable:exportar', 'portable:importar',
  'tipos:listar',
  'adjuntos:listar', 'adjuntos:subir', 'adjuntos:abrir', 'adjuntos:eliminar',
  'sistema:seleccionarArchivo', 'sistema:leerHojaCalculo', 'sistema:info'
];

/** Respuesta serializada por IPC: éxito con datos o error de negocio legible. */
export type RespuestaIpc<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string; detalles?: string[] };

/** API expuesta al renderer por el preload (window.api). */
export interface ApiRenderer {
  invocar<C extends NombreCanal>(canal: C, payload: CanalesIpc[C]['req']): Promise<CanalesIpc[C]['res']>;
}
