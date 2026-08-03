import type {
  Atributo, Categoria, CortePeriodicidad, DefinicionPeriodicidad, ElementoLista, Indicador,
  Levantamiento, Lista, Meta, RegistroAuditoria, ReglaNegocio, Resultado, Responsable
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
  nombre: s(f.nombre),
  definicion: s(f.definicion),
  periodicidad: s(f.periodicidad) as Periodicidad,
  lineaBase: nn(f.linea_base),
  metaGlobal: nn(f.meta_global),
  desagregaciones: json<string[]>(f.desagregaciones, []),
  estado: s(f.estado) as Indicador['estado'],
  responsable: sn(f.responsable),
  categoria: sn(f.categoria),
  unidadMedida: sn(f.unidad_medida),
  periodicidadPersonalizadaId: sn(f.periodicidad_personalizada_id),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deIndicador = (i: Indicador): unknown[] => [
  i.id, i.nombre, i.definicion, i.periodicidad, i.lineaBase, i.metaGlobal,
  JSON.stringify(i.desagregaciones), i.estado, i.responsable, i.categoria,
  i.unidadMedida, i.periodicidadPersonalizadaId, i.creadoEn, i.actualizadoEn
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
  activo: b(f.activo),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deAtributo = (a: Atributo): unknown[] => [
  a.id, a.entidad, a.nombre, a.descripcion, a.grupo, a.orden, a.visible, a.editable,
  a.obligatorio, a.valorPorDefecto, a.tipoDato, a.listaId, JSON.stringify(a.validaciones),
  a.condicionVisibilidad == null ? null : JSON.stringify(a.condicionVisibilidad),
  a.condicionObligatorio == null ? null : JSON.stringify(a.condicionObligatorio),
  a.activo, a.creadoEn, a.actualizadoEn
];

export const aLista = (f: Fila): Lista => ({
  id: s(f.id),
  nombre: s(f.nombre),
  descripcion: s(f.descripcion),
  estado: s(f.estado) as Lista['estado'],
  version: n(f.version),
  orden: n(f.orden),
  jerarquica: b(f.jerarquica),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deLista = (l: Lista): unknown[] => [
  l.id, l.nombre, l.descripcion, l.estado, l.version, l.orden, l.jerarquica, l.creadoEn, l.actualizadoEn
];

export const aElemento = (f: Fila): ElementoLista => ({
  id: s(f.id),
  listaId: s(f.lista_id),
  codigo: s(f.codigo),
  descripcion: s(f.descripcion),
  orden: n(f.orden),
  padreCodigo: sn(f.padre_codigo),
  activo: b(f.activo)
});

export const deElemento = (e: ElementoLista): unknown[] => [
  e.id, e.listaId, e.codigo, e.descripcion, e.orden, e.padreCodigo, e.activo
];

export const aMeta = (f: Fila): Meta => ({
  id: s(f.id),
  indicadorId: s(f.indicador_id),
  claveDesagregacion: s(f.clave_desagregacion),
  valor: n(f.valor),
  periodicidadMedicion: s(f.periodicidad_medicion) as Periodicidad,
  metodoCalculo: s(f.metodo_calculo) as Meta['metodoCalculo'],
  anioVigencia: n(f.anio_vigencia),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deMeta = (m: Meta): unknown[] => [
  m.id, m.indicadorId, m.claveDesagregacion, m.valor, m.periodicidadMedicion,
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
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deRegla = (r: ReglaNegocio): unknown[] => [
  r.id, r.nombre, r.descripcion, r.tipo, r.entidad, r.atributoObjetivoId,
  JSON.stringify(r.condicion), r.mensajeError, r.activa, r.creadoEn, r.actualizadoEn
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
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deResponsable = (r: Responsable): unknown[] => [
  r.id, r.nombre, r.correo, r.activo, r.creadoEn, r.actualizadoEn
];

export const aCategoria = (f: Fila): Categoria => ({
  id: s(f.id),
  nombre: s(f.nombre),
  descripcion: s(f.descripcion),
  activo: b(f.activo),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deCategoria = (c: Categoria): unknown[] => [
  c.id, c.nombre, c.descripcion, c.activo, c.creadoEn, c.actualizadoEn
];
