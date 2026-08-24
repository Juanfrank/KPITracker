import type {
  Adjunto, AliasDesagregacionOrigen, Atributo, AutomatizacionIndicador, Categoria, CortePeriodicidad,
  DefinicionPeriodicidad, ElementoLista, Equipo, Indicador, Levantamiento, Lista, MapeoColumna, Meta, OrigenAutomatico,
  ParametroDinamico, ParametroGeneral, RegistroAuditoria, ReglaNegocio, Resultado, ResultadoHistorial,
  Rol, Sesion, Usuario
} from '@domain/index';
import type { Periodicidad } from '@domain/index';

/**
 * Conversión fila SQL (snake_case + JSON en texto) <-> entidad de dominio.
 * `deX` devuelve un objeto con las columnas nombradas explícitamente (no un
 * arreglo posicional): así el INSERT/UPDATE de Knex liga por NOMBRE de
 * columna, inmune a que una tabla creada por una versión anterior tenga
 * columnas migradas fuera de orden (la misma razón por la que los INSERT
 * crudos de la era DuckDB ya nombraban sus columnas explícitamente).
 */

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
  equipo: sn(f.equipo),
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
export const deIndicador = (i: Indicador): Fila => ({
  id: i.id, codigo: i.codigo ?? '', nombre: i.nombre, definicion: i.definicion, forma_calculo: i.formaCalculo ?? null,
  periodicidad: i.periodicidad, linea_base: i.lineaBase, linea_base_periodo_id: i.lineaBasePeriodoId ?? null,
  meta_global: i.metaGlobal, desagregaciones: JSON.stringify(i.desagregaciones), estado: i.estado,
  responsable: i.responsable, categoria: i.categoria, equipo: i.equipo ?? null, unidad_medida: i.unidadMedida,
  periodicidad_personalizada_id: i.periodicidadPersonalizadaId, es_calculado: i.esCalculado ?? false,
  formula: i.formula ?? null, creado_en: i.creadoEn, actualizado_en: i.actualizadoEn
});

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

export const deAtributo = (a: Atributo): Fila => ({
  id: a.id, entidad: a.entidad, nombre: a.nombre, descripcion: a.descripcion, grupo: a.grupo, orden: a.orden,
  visible: a.visible, editable: a.editable, obligatorio: a.obligatorio, valor_por_defecto: a.valorPorDefecto,
  tipo_dato: a.tipoDato, lista_id: a.listaId, validaciones: JSON.stringify(a.validaciones),
  condicion_visibilidad: a.condicionVisibilidad == null ? null : JSON.stringify(a.condicionVisibilidad),
  condicion_obligatorio: a.condicionObligatorio == null ? null : JSON.stringify(a.condicionObligatorio),
  filtrable: a.filtrable ?? false, activo: a.activo, eliminado: a.eliminado ?? false,
  creado_en: a.creadoEn, actualizado_en: a.actualizadoEn
});

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

export const deLista = (l: Lista): Fila => ({
  id: l.id, nombre: l.nombre, descripcion: l.descripcion, prefijo: l.prefijo ?? '', estado: l.estado,
  version: l.version, orden: l.orden, jerarquica: l.jerarquica, eliminado: l.eliminado ?? false,
  creado_en: l.creadoEn, actualizado_en: l.actualizadoEn
});

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

export const deElemento = (e: ElementoLista): Fila => ({
  id: e.id, lista_id: e.listaId, codigo: e.codigo, nombre: e.nombre ?? '', descripcion: e.descripcion,
  orden: e.orden, padre_codigo: e.padreCodigo, activo: e.activo
});

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

export const deMeta = (m: Meta): Fila => ({
  id: m.id, indicador_id: m.indicadorId, clave_desagregacion: m.claveDesagregacion, valor: m.valor,
  periodicidad_medicion: m.periodicidadMedicion, periodicidad_personalizada_id: m.periodicidadPersonalizadaId ?? null,
  metodo_calculo: m.metodoCalculo, anio_vigencia: m.anioVigencia, creado_en: m.creadoEn, actualizado_en: m.actualizadoEn
});

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

export const deRegla = (r: ReglaNegocio): Fila => ({
  id: r.id, nombre: r.nombre, descripcion: r.descripcion, tipo: r.tipo, entidad: r.entidad,
  atributo_objetivo_id: r.atributoObjetivoId, condicion: JSON.stringify(r.condicion), mensaje_error: r.mensajeError,
  activa: r.activa, eliminado: r.eliminado ?? false, creado_en: r.creadoEn, actualizado_en: r.actualizadoEn
});

export const aResultado = (f: Fila): Resultado => ({
  id: s(f.id),
  indicadorId: s(f.indicador_id),
  periodoId: s(f.periodo_id),
  anio: n(f.anio),
  claveDesagregacion: s(f.clave_desagregacion),
  valor: nn(f.valor),
  observacion: sn(f.observacion),
  estadoValidacion: (sn(f.estado_validacion) ?? 'Pendiente') as Resultado['estadoValidacion'],
  validadoPor: sn(f.validado_por),
  validadoEn: sn(f.validado_en),
  comentarioValidacion: sn(f.comentario_validacion),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deResultado = (r: Resultado): Fila => ({
  id: r.id, indicador_id: r.indicadorId, periodo_id: r.periodoId, anio: r.anio,
  clave_desagregacion: r.claveDesagregacion, valor: r.valor, observacion: r.observacion,
  estado_validacion: r.estadoValidacion, validado_por: r.validadoPor, validado_en: r.validadoEn,
  comentario_validacion: r.comentarioValidacion,
  creado_en: r.creadoEn, actualizado_en: r.actualizadoEn
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

export const deLevantamiento = (l: Levantamiento): Fila => ({
  id: l.id, indicador_id: l.indicadorId, periodo_id: l.periodoId, anio: l.anio, fecha_corte: l.fechaCorte,
  desagregaciones_excluidas: JSON.stringify(l.desagregacionesExcluidas), comentario: l.comentario,
  creado_en: l.creadoEn, actualizado_en: l.actualizadoEn
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

export const deAuditoria = (r: RegistroAuditoria): Fila => ({
  id: r.id, usuario: r.usuario, fecha_hora: r.fechaHora, accion: r.accion, entidad: r.entidad,
  entidad_id: r.entidadId, campo: r.campo, valor_anterior: r.valorAnterior, valor_nuevo: r.valorNuevo
});

export const aDefinicionPeriodicidad = (f: Fila): DefinicionPeriodicidad => ({
  id: s(f.id),
  nombre: s(f.nombre),
  descripcion: s(f.descripcion),
  cortes: json<CortePeriodicidad[]>(f.cortes, []),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deDefinicionPeriodicidad = (d: DefinicionPeriodicidad): Fila => ({
  id: d.id, nombre: d.nombre, descripcion: d.descripcion, cortes: JSON.stringify(d.cortes),
  creado_en: d.creadoEn, actualizado_en: d.actualizadoEn
});

export const aCategoria = (f: Fila): Categoria => ({
  id: s(f.id),
  nombre: s(f.nombre),
  descripcion: s(f.descripcion),
  activo: b(f.activo),
  eliminado: b(f.eliminado ?? false),
  padreId: sn(f.padre_id),
  prefijo: sn(f.prefijo),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deCategoria = (c: Categoria): Fila => ({
  id: c.id, nombre: c.nombre, descripcion: c.descripcion, activo: c.activo, eliminado: c.eliminado ?? false,
  padre_id: c.padreId, prefijo: c.prefijo, creado_en: c.creadoEn, actualizado_en: c.actualizadoEn
});

export const aEquipo = (f: Fila): Equipo => ({
  id: s(f.id),
  nombre: s(f.nombre),
  descripcion: s(f.descripcion),
  activo: b(f.activo),
  eliminado: b(f.eliminado ?? false),
  padreId: sn(f.padre_id),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deEquipo = (e: Equipo): Fila => ({
  id: e.id, nombre: e.nombre, descripcion: e.descripcion, activo: e.activo, eliminado: e.eliminado ?? false,
  padre_id: e.padreId, creado_en: e.creadoEn, actualizado_en: e.actualizadoEn
});

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

export const deOrigenAutomatico = (o: OrigenAutomatico): Fila => ({
  id: o.id, nombre: o.nombre, tipo: o.tipo, descripcion: o.descripcion, configuracion: JSON.stringify(o.configuracion),
  parametros_generales: JSON.stringify(o.parametrosGenerales ?? []), activo: o.activo, eliminado: o.eliminado ?? false,
  creado_en: o.creadoEn, actualizado_en: o.actualizadoEn
});

export const aAutomatizacionIndicador = (f: Fila): AutomatizacionIndicador => ({
  id: s(f.id),
  indicadorId: s(f.indicador_id),
  origenAutomaticoId: s(f.origen_automatico_id),
  parametrosDinamicos: json<ParametroDinamico[]>(f.parametros_dinamicos, []),
  script: s(f.script),
  columnaValor: sn(f.columna_valor),
  mapeoColumnas: json<MapeoColumna[]>(f.mapeo_columnas, []),
  desagregacionesOmitidas: json<string[]>(f.desagregaciones_omitidas, []),
  medidaDax: sn(f.medida_dax),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deAutomatizacionIndicador = (a: AutomatizacionIndicador): Fila => ({
  id: a.id, indicador_id: a.indicadorId, origen_automatico_id: a.origenAutomaticoId,
  parametros_dinamicos: JSON.stringify(a.parametrosDinamicos), script: a.script, columna_valor: a.columnaValor,
  mapeo_columnas: JSON.stringify(a.mapeoColumnas), desagregaciones_omitidas: JSON.stringify(a.desagregacionesOmitidas),
  medida_dax: a.medidaDax ?? null, creado_en: a.creadoEn, actualizado_en: a.actualizadoEn
});

export const aAliasDesagregacionOrigen = (f: Fila): AliasDesagregacionOrigen => ({
  id: s(f.id),
  listaId: s(f.lista_id),
  origenAutomaticoId: s(f.origen_automatico_id),
  alias: s(f.alias),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deAliasDesagregacionOrigen = (a: AliasDesagregacionOrigen): Fila => ({
  id: a.id, lista_id: a.listaId, origen_automatico_id: a.origenAutomaticoId, alias: a.alias,
  creado_en: a.creadoEn, actualizado_en: a.actualizadoEn
});

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

export const deResultadoHistorial = (h: ResultadoHistorial): Fila => ({
  id: h.id, indicador_id: h.indicadorId, periodo_id: h.periodoId, clave_desagregacion: h.claveDesagregacion,
  version: h.version, valor: h.valor, observacion: h.observacion, usuario: h.usuario, actualizado_en: h.actualizadoEn
});

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

export const deAdjunto = (a: Adjunto): Fila => ({
  id: a.id, entidad: a.entidad, entidad_id: a.entidadId, nombre_archivo: a.nombreArchivo,
  ruta_relativa: a.rutaRelativa, tamanio_bytes: a.tamanioBytes, comentario: a.comentario, subido_en: a.subidoEn
});

export const aUsuario = (f: Fila): Usuario => ({
  id: s(f.id),
  nombreUsuario: s(f.nombre_usuario),
  nombreCompleto: s(f.nombre_completo),
  correo: sn(f.correo),
  passwordHash: s(f.password_hash),
  esAdministrador: b(f.es_administrador),
  rolGeneralId: sn(f.rol_general_id),
  equipoId: sn(f.equipo_id),
  rolEquipoId: sn(f.rol_equipo_id),
  activo: b(f.activo),
  eliminado: b(f.eliminado ?? false),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deUsuario = (u: Usuario): Fila => ({
  id: u.id, nombre_usuario: u.nombreUsuario, nombre_completo: u.nombreCompleto, correo: u.correo,
  password_hash: u.passwordHash,
  es_administrador: u.esAdministrador, rol_general_id: u.rolGeneralId, equipo_id: u.equipoId,
  rol_equipo_id: u.rolEquipoId,
  activo: u.activo, eliminado: u.eliminado ?? false, creado_en: u.creadoEn, actualizado_en: u.actualizadoEn
});

export const aRol = (f: Fila): Rol => ({
  id: s(f.id),
  nombre: s(f.nombre),
  ambito: s(f.ambito) as Rol['ambito'],
  permisos: json<string[]>(f.permisos, []),
  esSistema: b(f.es_sistema),
  creadoEn: s(f.creado_en),
  actualizadoEn: s(f.actualizado_en)
});

export const deRol = (r: Rol): Fila => ({
  id: r.id, nombre: r.nombre, ambito: r.ambito, permisos: JSON.stringify(r.permisos), es_sistema: r.esSistema,
  creado_en: r.creadoEn, actualizado_en: r.actualizadoEn
});

export const aSesion = (f: Fila): Sesion => ({
  id: s(f.id),
  usuarioId: s(f.usuario_id),
  creadoEn: s(f.creado_en),
  expiraEn: s(f.expira_en)
});

export const deSesion = (se: Sesion): Fila => ({
  id: se.id, usuario_id: se.usuarioId, creado_en: se.creadoEn, expira_en: se.expiraEn
});
