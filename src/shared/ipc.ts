import type {
  Adjunto, Atributo, Categoria, DefinicionPeriodicidad, ConfiguracionGeneral, ElementoLista, EntidadAdjunto,
  Indicador, Lista, Meta, Periodo, RegistroAuditoria, ReglaNegocio, Responsable, ResultadoHistorial
} from '@domain/index';
import type { FiltroAuditoria, ValorAtributoEntidad } from '@application/ports/index';
import type { DatosCaptura } from '@application/use-cases/ServicioRecoleccion';
import type {
  GuardarIndicadorInput, MapeoImportacionIndicadores, ResultadoImportacionIndicadores
} from '@application/use-cases/ServicioCatalogos';
import type { DetalleSeguimiento, FilaTablero } from '@application/use-cases/ServicioSeguimiento';
import type { ReglaFechaLimiteDisponible } from '@application/use-cases/ServicioConfiguracion';

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

  'recoleccion:periodos': { req: { indicadorId: string }; res: Periodo[] };
  'recoleccion:captura': { req: { indicadorId: string; periodoId: string }; res: DatosCaptura };
  'recoleccion:guardarCelda': {
    req: { indicadorId: string; periodoId: string; claveDesagregacion: string; valorCrudo: string; observacion?: string | null };
    res: { valor: number | null; advertencias: string[] };
  };
  'recoleccion:fechaCorte': { req: { indicadorId: string; periodoId: string; fechaCorte: string | null }; res: void };
  'recoleccion:exclusion': { req: { indicadorId: string; periodoId: string; listaId: string; excluir: boolean }; res: void };
  'recoleccion:historial': {
    req: { indicadorId: string; periodoId: string; claveDesagregacion: string };
    res: ResultadoHistorial[];
  };
  'recoleccion:restaurarVersion': {
    req: { indicadorId: string; periodoId: string; claveDesagregacion: string; version: number };
    res: { valor: number | null; advertencias: string[] };
  };

  'seguimiento:tablero': { req: void; res: FilaTablero[] };
  'seguimiento:detalle': { req: { indicadorId: string }; res: DetalleSeguimiento | null };

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
}

export type NombreCanal = keyof CanalesIpc;

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
  'recoleccion:periodos', 'recoleccion:captura', 'recoleccion:guardarCelda', 'recoleccion:fechaCorte', 'recoleccion:exclusion',
  'recoleccion:historial', 'recoleccion:restaurarVersion',
  'seguimiento:tablero', 'seguimiento:detalle',
  'exportacion:regenerar', 'exportacion:ruta',
  'auditoria:consultar',
  'portable:exportar', 'portable:importar',
  'tipos:listar',
  'adjuntos:listar', 'adjuntos:subir', 'adjuntos:abrir', 'adjuntos:eliminar',
  'sistema:seleccionarArchivo', 'sistema:leerHojaCalculo'
];

/** Respuesta serializada por IPC: éxito con datos o error de negocio legible. */
export type RespuestaIpc<T> =
  | { ok: true; datos: T }
  | { ok: false; error: string; detalles?: string[] };

/** API expuesta al renderer por el preload (window.api). */
export interface ApiRenderer {
  invocar<C extends NombreCanal>(canal: C, payload: CanalesIpc[C]['req']): Promise<CanalesIpc[C]['res']>;
}
