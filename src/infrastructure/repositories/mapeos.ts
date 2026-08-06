import type {
  Adjunto, AliasDesagregacionOrigen, Atributo, AutomatizacionIndicador, Categoria, CortePeriodicidad,
  DefinicionPeriodicidad, ElementoLista, Indicador, Levantamiento, Lista, MapeoColumna, Meta, OrigenAutomatico,
  ParametroDinamico, ParametroGeneral, RegistroAuditoria, ReglaNegocio, Resultado, ResultadoHistorial, Responsable
} from '@domain/index';
import type { Periodicidad } from '@domain/index';

/** Conversión fila DuckDB (snake_case + JSON en texto) <-> entidad de dominio. */

type Fila = Record<string, unknown>;

const s = (v: unknown): string => String(v ?? '');
const sn = (v: unknown): string | null => (v == null ? null : String(v));
const n = (v: unknown): number => Number(v ?? 0);
const nn = (v: unknown): number | null => (v == null ? null : Number(v));
const b = (v: unknown): boolean => Boolean(v);
const json = <T>(v: unknown, porDefecto: T): T => {
  if (v == null || v === '') return porDefecto;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return porDefecto;
  }
};

export const aIndicador = (f: Fila): Indicador => ({
  id: s(f.id),
  codigo: s(f.codigo),
  nombre: s(f.nombre),
  definicion: s(f.definicion),
  formaCalculo: sn(f.forma_calculo),
  periodicidad: s(f.periodicidad) as Periodicidad,
  lineaBase: nn(f.linea_base),
  lineaBasePeriodoId: sn(f.linea_base_periodo_id),
  metaGlobal: nn(f.meta_global),
  desagregaciones: json<string[]>(f.desagregaciones, []),
  estado: s(f.estado) as Indicador['estado'],
  responsable: sn(f.responsable),
  categoria: sn(f.categoria),
  unidadMedida: sn(f.unidad_medida),
  periodicidadPersonalizadaId: sn(f.periodicidad_personalizada_id),
  esCalculado: b(f.es_calculado),
  formula: sn(f.formula),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

// Nota: `codigo`, `lineaBasePeriodoId`, `esCalculado` y `formula` se leen con
// fallback (?? '' / ?? null / ?? false) porque además de las escrituras
// normales (siempre con Indicador completo), esta función serializa
// registros importados de archivos de configuración portable anteriores a
// estos campos (ver ConfigPortableService), que llegan como `Record<string,
// unknown>` sin ellos.
// Las columnas `origen_automatico_id`/`parametros_origen` de la tabla son
// vestigiales (la configuración de obtención automática vive ahora en
// `automatizaciones_indicador`, ver AutomatizacionIndicador): se escriben
// siempre en null para no romper el conteo posicional de columnas.
export const deIndicador = (i: Indicador): unknown[] => [
  i.id, i.codigo ?? '', i.nombre, i.definicion, i.formaCalculo ?? null, i.periodicidad, i.lineaBase, i.lineaBasePeriodoId ?? null, i.metaGlobal,
  JSON.stringify(i.desagregaciones), i.estado, i.responsable, i.categoria,
  i.unidadMedida, i.periodicidadPersonalizadaId, i.esCalculado ?? false, i.formula ?? null,
  null, null,
  i.creadoEn, i.actualizadoEn
];

export const aAtributo = (f: Fila): Atributo => ({
  id: s(f.id),
  entidad: s(f.entidad) as Atributo['entidad'],
  nombre: s(f.nombre),
  descripcion: s(f.descripcion),
  grupo: s(f.grupo),
  orden: n(f.orden),
  visible: b(f.visible),
  editable: b(f.editable),
  obligatorio: b(f.obligatorio),
  valorPorDefecto: sn(f.valor_por_defecto),
  tipoDato: s(f.tipo_dato) as Atributo['tipoDato'],
  listaId: sn(f.lista_id),
  validaciones: json(f.validaciones, []),
  condicionVisibilidad: json(f.condicion_visibilidad, null),
  condicionObligatorio: json(f.condicion_obligatorio, null),
  filtrable: b(f.filtrable),
  activo: b(f.activo),
  eliminado: b(f.eliminado ?? false),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deAtributo = (a: Atributo): unknown[] => [
  a.id, a.entidad, a.nombre, a.descripcion, a.grupo, a.orden, a.visible, a.editable,
  a.obligatorio, a.valorPorDefecto, a.tipoDato, a.listaId, JSON.stringify(a.validaciones),
  a.condicionVisibilidad == null ? null : JSON.stringify(a.condicionVisibilidad),
  a.condicionObligatorio == null ? null : JSON.stringify(a.condicionObligatorio),
  a.filtrable ?? false, a.activo, a.eliminado ?? false, a.creadoEn, a.actualizadoEn
];

export const aLista = (f: Fila): Lista => ({
  id: s(f.id),
  nombre: s(f.nombre),
  descripcion: s(f.descripcion),
  prefijo: s(f.prefijo),
  estado: s(f.estado) as Lista['estado'],
  version: n(f.version),
  orden: n(f.orden),
  jerarquica: b(f.jerarquica),
  eliminado: b(f.eliminado ?? false),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deLista = (l: Lista): unknown[] => [
  l.id, l.nombre, l.descripcion, l.prefijo ?? '', l.estado, l.version, l.orden, l.jerarquica,
  l.eliminado ?? false, l.creadoEn, l.actualizadoEn
];

export const aElemento = (f: Fila): ElementoLista => ({
  id: s(f.id),
  listaId: s(f.lista_id),
  codigo: s(f.codigo),
  nombre: s(f.nombre),
  descripcion: s(f.descripcion),
  orden: n(f.orden),
  padreCodigo: sn(f.padre_codigo),
  activo: b(f.activo)
});

export const deElemento = (e: ElementoLista): unknown[] => [
  e.id, e.listaId, e.codigo, e.nombre ?? '', e.descripcion, e.orden, e.padreCodigo, e.activo
];

export const aMeta = (f: Fila): Meta => ({
  id: s(f.id),
  indicadorId: s(f.indicador_id),
  claveDesagregacion: s(f.clave_desagregacion),
  valor: n(f.valor),
  periodicidadMedicion: s(f.periodicidad_medicion) as Periodicidad,
  periodicidadPersonalizadaId: sn(f.periodicidad_personalizada_id),
  metodoCalculo: s(f.metodo_calculo) as Meta['metodoCalculo'],
  anioVigencia: n(f.anio_vigencia),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deMeta = (m: Meta): unknown[] => [
  m.id, m.indicadorId, m.claveDesagregacion, m.valor, m.periodicidadMedicion, m.periodicidadPersonalizadaId ?? null,
  m.metodoCalculo, m.anioVigencia, m.creadoEn, m.actualizadoEn
];

export const aRegla = (f: Fila): ReglaNegocio => ({
  id: s(f.id),
  nombre: s(f.nombre),
  descripcion: s(f.descripcion),
  tipo: s(f.tipo) as ReglaNegocio['tipo'],
  entidad: s(f.entidad),
  atributoObjetivoId: sn(f.atributo_objetivo_id),
  condicion: json(f.condicion, { op: 'and', args: [] }),
  mensajeError: sn(f.mensaje_error),
  activa: b(f.activa),
  eliminado: b(f.eliminado ?? false),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deRegla = (r: ReglaNegocio): unknown[] => [
  r.id, r.nombre, r.descripcion, r.tipo, r.entidad, r.atributoObjetivoId,
  JSON.stringify(r.condicion), r.mensajeError, r.activa, r.eliminado ?? false, r.creadoEn, r.actualizadoEn
];

export const aResultado = (f: Fila): Resultado => ({
  id: s(f.id),
  indicadorId: s(f.indicador_id),
  periodoId: s(f.periodo_id),
  anio: n(f.anio),
  claveDesagregacion: s(f.clave_desagregacion),
  valor: nn(f.valor),
  observacion: sn(f.observacion),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const aLevantamiento = (f: Fila): Levantamiento => ({
  id: s(f.id),
  indicadorId: s(f.indicador_id),
  periodoId: s(f.periodo_id),
  anio: n(f.anio),
  fechaCorte: sn(f.fecha_corte),
  desagregacionesExcluidas: json<string[]>(f.desagregaciones_excluidas, []),
  comentario: sn(f.comentario),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const aAuditoria = (f: Fila): RegistroAuditoria => ({
  id: s(f.id),
  usuario: s(f.usuario),
  fechaHora: s(f.fecha_hora),
  accion: s(f.accion) as RegistroAuditoria['accion'],
  entidad: s(f.entidad),
  entidadId: s(f.entidad_id),
  campo: sn(f.campo),
  valorAnterior: sn(f.valor_anterior),
  valorNuevo: sn(f.valor_nuevo)
});

export const aDefinicionPeriodicidad = (f: Fila): DefinicionPeriodicidad => ({
  id: s(f.id),
  nombre: s(f.nombre),
  descripcion: s(f.descripcion),
  cortes: json<CortePeriodicidad[]>(f.cortes, []),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deDefinicionPeriodicidad = (d: DefinicionPeriodicidad): unknown[] => [
  d.id, d.nombre, d.descripcion, JSON.stringify(d.cortes), d.creadoEn, d.actualizadoEn
];

export const aResponsable = (f: Fila): Responsable => ({
  id: s(f.id),
  nombre: s(f.nombre),
  correo: sn(f.correo),
  activo: b(f.activo),
  eliminado: b(f.eliminado ?? false),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deResponsable = (r: Responsable): unknown[] => [
  r.id, r.nombre, r.correo, r.activo, r.eliminado ?? false, r.creadoEn, r.actualizadoEn
];

export const aCategoria = (f: Fila): Categoria => ({
  id: s(f.id),
  nombre: s(f.nombre),
  descripcion: s(f.descripcion),
  activo: b(f.activo),
  eliminado: b(f.eliminado ?? false),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deCategoria = (c: Categoria): unknown[] => [
  c.id, c.nombre, c.descripcion, c.activo, c.eliminado ?? false, c.creadoEn, c.actualizadoEn
];

export const aOrigenAutomatico = (f: Fila): OrigenAutomatico => ({
  id: s(f.id),
  nombre: s(f.nombre),
  tipo: s(f.tipo) as OrigenAutomatico['tipo'],
  descripcion: s(f.descripcion),
  configuracion: json<Record<string, string>>(f.configuracion, {}),
  parametrosGenerales: json<ParametroGeneral[]>(f.parametros_generales, []),
  activo: b(f.activo),
  eliminado: b(f.eliminado ?? false),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deOrigenAutomatico = (o: OrigenAutomatico): unknown[] => [
  o.id, o.nombre, o.tipo, o.descripcion, JSON.stringify(o.configuracion),
  JSON.stringify(o.parametrosGenerales ?? []), o.activo, o.eliminado ?? false, o.creadoEn, o.actualizadoEn
];

export const aAutomatizacionIndicador = (f: Fila): AutomatizacionIndicador => ({
  id: s(f.id),
  indicadorId: s(f.indicador_id),
  origenAutomaticoId: s(f.origen_automatico_id),
  parametrosDinamicos: json<ParametroDinamico[]>(f.parametros_dinamicos, []),
  script: s(f.script),
  columnaValor: sn(f.columna_valor),
  mapeoColumnas: json<MapeoColumna[]>(f.mapeo_columnas, []),
  desagregacionesOmitidas: json<string[]>(f.desagregaciones_omitidas, []),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deAutomatizacionIndicador = (a: AutomatizacionIndicador): unknown[] => [
  a.id, a.indicadorId, a.origenAutomaticoId, JSON.stringify(a.parametrosDinamicos), a.script,
  a.columnaValor, JSON.stringify(a.mapeoColumnas), JSON.stringify(a.desagregacionesOmitidas),
  a.creadoEn, a.actualizadoEn
];

export const aAliasDesagregacionOrigen = (f: Fila): AliasDesagregacionOrigen => ({
  id: s(f.id),
  listaId: s(f.lista_id),
  origenAutomaticoId: s(f.origen_automatico_id),
  alias: s(f.alias),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deAliasDesagregacionOrigen = (a: AliasDesagregacionOrigen): unknown[] => [
  a.id, a.listaId, a.origenAutomaticoId, a.alias, a.creadoEn, a.actualizadoEn
];

export const aResultadoHistorial = (f: Fila): ResultadoHistorial => ({
  id: s(f.id),
  indicadorId: s(f.indicador_id),
  periodoId: s(f.periodo_id),
  claveDesagregacion: s(f.clave_desagregacion),
  version: n(f.version),
  valor: nn(f.valor),
  observacion: sn(f.observacion),
  usuario: s(f.usuario),
  actualizadoEn: s(f.actualizado_en)
});

export const deResultadoHistorial = (h: ResultadoHistorial): unknown[] => [
  h.id, h.indicadorId, h.periodoId, h.claveDesagregacion, h.version, h.valor,
  h.observacion, h.usuario, h.actualizadoEn
];

export const aAdjunto = (f: Fila): Adjunto => ({
  id: s(f.id),
  entidad: s(f.entidad) as Adjunto['entidad'],
  entidadId: s(f.entidad_id),
  nombreArchivo: s(f.nombre_archivo),
  rutaRelativa: s(f.ruta_relativa),
  tamanioBytes: n(f.tamanio_bytes),
  comentario: sn(f.comentario),
  subidoEn: s(f.subido_en)
});

export const deAdjunto = (a: Adjunto): unknown[] => [
  a.id, a.entidad, a.entidadId, a.nombreArchivo, a.rutaRelativa, a.tamanioBytes, a.comentario, a.subidoEn
];
