import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Categoria, Equipo } from '@domain/index';
import { etiquetaConPrefijo } from '@domain/index';
import type { FilaHistorico, FilaTablero, DetalleSeguimiento } from '@application/use-cases/ServicioSeguimiento';
import { indicadoresQueRequierenNotificacion } from '@application/notificaciones/DetectorVencimientos';
import { invocar } from '../../api';
import { trpcClient } from '../../trpc';
import { BarraProgreso, ChipEstado, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

/** Usuario asignable como responsable de un indicador (Batch U: unificado con el antiguo catálogo Responsable). */
type UsuarioAsignable = Awaited<ReturnType<typeof trpcClient.usuarios.listar.query>>[number];

const PESTANAS = [
  { id: 'estado', etiqueta: 'Estado' },
  { id: 'historico', etiqueta: 'Histórico' }
] as const;
type Pestana = (typeof PESTANAS)[number]['id'];

const VISTAS_ESTADO = [
  { id: 'lista', etiqueta: 'Lista' },
  { id: 'arbol', etiqueta: 'Árbol (Categoría)' },
  { id: 'equipo', etiqueta: 'Árbol (Equipo)' }
] as const;
type VistaEstado = (typeof VISTAS_ESTADO)[number]['id'];

/** Id sintético del grupo "sin categoría" — nunca colisiona con un id de categoría real (uuid). */
const SIN_CATEGORIA = '__sin-categoria__';
/** Id sintético del grupo "sin equipo" — nunca colisiona con un id de equipo real (uuid). */
const SIN_EQUIPO = '__sin-equipo__';

type NodoArbolSeguimiento =
  | { tipo: 'equipo'; id: string; nivel: number; nombre: string; contador: number; tieneHijos: boolean }
  | { tipo: 'categoria'; id: string; nivel: number; nombre: string; prefijo: string | null; contador: number; tieneHijos: boolean }
  | { tipo: 'indicador'; id: string; nivel: number; fila: FilaTablero };

/**
 * Nodos categoría → subcategoría → indicador para un subconjunto de
 * `filas`, partiendo de `nivelBase` — reutilizado tal cual por
 * `construirArbolSeguimiento` (vista "Árbol (Categoría)", `nivelBase=0`,
 * `prefijoId=''`) y por `construirArbolEquipoSeguimiento` (anidado bajo
 * cada equipo). `prefijoId` evita que dos grupos "Sin categoría" —o la
 * misma categoría repetida bajo dos equipos distintos, ya que una
 * categoría no pertenece a un único equipo— compartan id: sin esto,
 * colapsar uno colapsaría el otro y React vería `key`s duplicadas.
 */
function construirNodosCategoria(
  filas: FilaTablero[], categorias: Categoria[], nivelBase: number, prefijoId = ''
): NodoArbolSeguimiento[] {
  const categoriasPorId = new Map(categorias.map((c) => [c.id, c]));
  const hijosDe = new Map<string | null, Categoria[]>();
  for (const c of categorias) {
    const clave = c.padreId && categoriasPorId.has(c.padreId) ? c.padreId : null;
    const lista = hijosDe.get(clave) ?? [];
    lista.push(c);
    hijosDe.set(clave, lista);
  }
  for (const lista of hijosDe.values()) lista.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const filasPorCategoria = new Map<string, FilaTablero[]>();
  const sinCategoria: FilaTablero[] = [];
  for (const f of filas) {
    if (f.categoriaId && categoriasPorId.has(f.categoriaId)) {
      const lista = filasPorCategoria.get(f.categoriaId) ?? [];
      lista.push(f);
      filasPorCategoria.set(f.categoriaId, lista);
    } else {
      sinCategoria.push(f);
    }
  }

  const contarTotal = (categoriaId: string): number => {
    let total = (filasPorCategoria.get(categoriaId) ?? []).length;
    for (const hijo of hijosDe.get(categoriaId) ?? []) total += contarTotal(hijo.id);
    return total;
  };

  const nodos: NodoArbolSeguimiento[] = [];
  const visitar = (categoria: Categoria, nivel: number): void => {
    const hijos = hijosDe.get(categoria.id) ?? [];
    const propias = [...(filasPorCategoria.get(categoria.id) ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre));
    nodos.push({
      tipo: 'categoria', id: `${prefijoId}${categoria.id}`, nivel, nombre: categoria.nombre, prefijo: categoria.prefijo,
      contador: contarTotal(categoria.id), tieneHijos: hijos.length > 0 || propias.length > 0
    });
    for (const hijo of hijos) visitar(hijo, nivel + 1);
    for (const f of propias) nodos.push({ tipo: 'indicador', id: f.indicadorId, nivel: nivel + 1, fila: f });
  };
  for (const raiz of hijosDe.get(null) ?? []) visitar(raiz, nivelBase);

  if (sinCategoria.length > 0) {
    nodos.push({
      tipo: 'categoria', id: `${prefijoId}${SIN_CATEGORIA}`, nivel: nivelBase, nombre: 'Sin categoría', prefijo: null,
      contador: sinCategoria.length, tieneHijos: true
    });
    for (const f of [...sinCategoria].sort((a, b) => a.nombre.localeCompare(b.nombre))) {
      nodos.push({ tipo: 'indicador', id: f.indicadorId, nivel: nivelBase + 1, fila: f });
    }
  }
  return nodos;
}

/**
 * Construye la vista jerárquica Categoría → Subcategoría → Indicador a
 * partir de `filas` (ya filtradas) y el catálogo completo de categorías —
 * 100% en el renderer, sin tocar `ServicioSeguimiento` (no hace falta:
 * `categoriasCatalogo` ya se trae para el filtro plano existente). Bajo
 * cada nodo-categoría van primero sus subcategorías (recursivo, orden
 * alfabético) y luego sus indicadores propios como filas hoja; un grupo
 * final "Sin categoría" agrupa los indicadores con `categoriaId == null`.
 * DFS pre-order + `nivel` como profundidad — misma convención que
 * `ArbolDesagregaciones`/`calcularFilasVisibles` (RecoleccionPage), para
 * poder expandir/colapsar sin reconstruir el árbol.
 */
function construirArbolSeguimiento(filas: FilaTablero[], categorias: Categoria[]): NodoArbolSeguimiento[] {
  return construirNodosCategoria(filas, categorias, 0);
}

/**
 * Construye la vista jerárquica Equipo → Sub-equipo → Categoría →
 * Subcategoría → Indicador: agrupa primero por `equipoId` (el equipo
 * EFECTIVO ya resuelto por `ServicioSeguimiento.tablero()` — directo si
 * está seteado, si no indirecto vía el responsable, ver `equipoEfectivo`),
 * y bajo cada equipo anida el mismo árbol de categorías que
 * `construirArbolSeguimiento` (vía `construirNodosCategoria`), solo con
 * los indicadores de ese equipo. Un grupo final "Sin equipo" agrupa los
 * indicadores sin equipo efectivo, con su propio árbol de categorías.
 */
function construirArbolEquipoSeguimiento(filas: FilaTablero[], equipos: Equipo[], categorias: Categoria[]): NodoArbolSeguimiento[] {
  const equiposPorId = new Map(equipos.map((e) => [e.id, e]));
  const hijosDe = new Map<string | null, Equipo[]>();
  for (const e of equipos) {
    const clave = e.padreId && equiposPorId.has(e.padreId) ? e.padreId : null;
    const lista = hijosDe.get(clave) ?? [];
    lista.push(e);
    hijosDe.set(clave, lista);
  }
  for (const lista of hijosDe.values()) lista.sort((a, b) => a.nombre.localeCompare(b.nombre));

  const filasPorEquipo = new Map<string, FilaTablero[]>();
  const sinEquipo: FilaTablero[] = [];
  for (const f of filas) {
    if (f.equipoId && equiposPorId.has(f.equipoId)) {
      const lista = filasPorEquipo.get(f.equipoId) ?? [];
      lista.push(f);
      filasPorEquipo.set(f.equipoId, lista);
    } else {
      sinEquipo.push(f);
    }
  }

  const contarTotal = (equipoId: string): number => {
    let total = (filasPorEquipo.get(equipoId) ?? []).length;
    for (const hijo of hijosDe.get(equipoId) ?? []) total += contarTotal(hijo.id);
    return total;
  };

  const nodos: NodoArbolSeguimiento[] = [];
  const visitar = (equipo: Equipo, nivel: number): void => {
    const hijos = hijosDe.get(equipo.id) ?? [];
    const nodosCategoria = construirNodosCategoria(filasPorEquipo.get(equipo.id) ?? [], categorias, nivel + 1, `${equipo.id}:`);
    nodos.push({
      tipo: 'equipo', id: equipo.id, nivel, nombre: equipo.nombre,
      contador: contarTotal(equipo.id), tieneHijos: hijos.length > 0 || nodosCategoria.length > 0
    });
    for (const hijo of hijos) visitar(hijo, nivel + 1);
    nodos.push(...nodosCategoria);
  };
  for (const raiz of hijosDe.get(null) ?? []) visitar(raiz, 0);

  if (sinEquipo.length > 0) {
    const nodosCategoria = construirNodosCategoria(sinEquipo, categorias, 1, `${SIN_EQUIPO}:`);
    nodos.push({
      tipo: 'equipo', id: SIN_EQUIPO, nivel: 0, nombre: 'Sin equipo',
      contador: sinEquipo.length, tieneHijos: nodosCategoria.length > 0
    });
    nodos.push(...nodosCategoria);
  }
  return nodos;
}

/**
 * Igual convención que `calcularFilasVisibles` (RecoleccionPage): las filas
 * llegan en DFS pre-order con `nivel` como profundidad, así que un nodo de
 * agrupación (categoría o equipo) colapsado oculta exactamente el tramo
 * contiguo siguiente cuya profundidad sea mayor que la suya, sin
 * reconstruir el árbol. Solo los nodos que agrupan (todo menos
 * `'indicador'`) son colapsables.
 */
function nodosVisibles(nodos: NodoArbolSeguimiento[], colapsadas: Set<string>): NodoArbolSeguimiento[] {
  const visibles: NodoArbolSeguimiento[] = [];
  let ocultarDesdeNivel: number | null = null;
  for (const nodo of nodos) {
    if (ocultarDesdeNivel !== null) {
      if (nodo.nivel > ocultarDesdeNivel) continue;
      ocultarDesdeNivel = null;
    }
    visibles.push(nodo);
    if (nodo.tipo !== 'indicador' && nodo.tieneHijos && colapsadas.has(nodo.id)) ocultarDesdeNivel = nodo.nivel;
  }
  return visibles;
}

const FILTROS_ESTADO = [
  { id: 'todos', etiqueta: 'Todos' },
  { id: 'Pendiente', etiqueta: 'Pendientes' },
  { id: 'EnProgreso', etiqueta: 'En progreso' },
  { id: 'Vencido', etiqueta: 'Vencidos' },
  { id: 'Completo', etiqueta: 'Completados' }
];

/**
 * Tablero de Seguimiento: estados calculados dinámicamente (fecha actual,
 * fecha límite, periodicidad, períodos registrados y fecha de corte) —
 * nunca a partir de banderas persistidas.
 */
export function SeguimientoPage(): React.JSX.Element {
  const [pestana, setPestana] = useState<Pestana>('estado');
  const [vistaEstado, setVistaEstado] = useState<VistaEstado>('lista');
  const [colapsadasCategorias, setColapsadasCategorias] = useState<Set<string>>(new Set());
  const [colapsadasEquipo, setColapsadasEquipo] = useState<Set<string>>(new Set());
  const [filas, setFilas] = useState<FilaTablero[]>([]);
  const [historico, setHistorico] = useState<FilaHistorico[] | null>(null);
  const [cargandoHistorico, setCargandoHistorico] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroPeriodicidad, setFiltroPeriodicidad] = useState('todas');
  const [filtroResponsable, setFiltroResponsable] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtrosAtributos, setFiltrosAtributos] = useState<Record<string, string>>({});
  const [filtroTexto, setFiltroTexto] = useState('');
  const [detalle, setDetalle] = useState<DetalleSeguimiento | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [responsablesCatalogo, setResponsablesCatalogo] = useState<UsuarioAsignable[]>([]);
  const [categoriasCatalogo, setCategoriasCatalogo] = useState<Categoria[]>([]);
  const [equiposCatalogo, setEquiposCatalogo] = useState<Equipo[]>([]);
  const [reasignando, setReasignando] = useState(false);
  const [avisoDescartado, setAvisoDescartado] = useState(false);
  const navigate = useNavigate();

  /**
   * Reemplazo mínimo (Fase 4 §9.1/§9.7) de la notificación proactiva
   * nativa de Electron (`Notification` del proceso main, cada hora — ver
   * `src/main/index.ts`, sin equivalente en un servidor web): un banner
   * descartable, calculado en el cliente contra el tablero ya cargado con
   * la misma función pura que usaba el disparo original. Sin persistencia
   * entre sesiones ni permisos del navegador — un rediseño real (cron +
   * email/webhook) queda fuera de esta fase, ver "Riesgos residuales" del plan.
   */
  const avisosVencimiento = useMemo(
    () => indicadoresQueRequierenNotificacion(filas, new Date().toISOString().slice(0, 10)),
    [filas]
  );

  const cargarTablero = (): void => {
    void invocar('seguimiento:tablero', undefined)
      .then(setFilas)
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargarTablero();
    void trpcClient.usuarios.listar.query().then(setResponsablesCatalogo);
    void invocar('categorias:listar', undefined).then(setCategoriasCatalogo);
    void invocar('equipos:listar', undefined).then(setEquiposCatalogo);
  }, []);

  useEffect(() => {
    if (pestana === 'historico' && historico === null) {
      setCargandoHistorico(true);
      void invocar('seguimiento:historico', undefined)
        .then(setHistorico)
        .finally(() => setCargandoHistorico(false));
    }
  }, [pestana, historico]);

  const periodicidades = [...new Set(filas.map((f) => f.periodicidad))];
  const responsablesUnicos = [...new Map(filas.filter((f) => f.responsableId).map((f) => [f.responsableId as string, f.responsable ?? f.responsableId as string])).entries()];
  const categoriasUnicas = [...new Map(filas.filter((f) => f.categoriaId).map((f) => [f.categoriaId as string, f.categoria ?? f.categoriaId as string])).entries()];
  const atributosFiltrables = filas[0]?.atributosFiltro.map((a) => ({ id: a.atributoId, nombre: a.nombre })) ?? [];
  const valoresPorAtributo = new Map<string, string[]>();
  for (const a of atributosFiltrables) {
    const valores = new Set<string>();
    for (const f of filas) {
      const v = f.atributosFiltro.find((x) => x.atributoId === a.id)?.valor;
      if (v) valores.add(v);
    }
    valoresPorAtributo.set(a.id, [...valores].sort());
  }

  const visibles = filas.filter(
    (f) =>
      (filtroEstado === 'todos' || f.estado === filtroEstado) &&
      (filtroPeriodicidad === 'todas' || f.periodicidad === filtroPeriodicidad) &&
      (filtroResponsable === 'todos' || f.responsableId === filtroResponsable) &&
      (filtroCategoria === 'todas' || f.categoriaId === filtroCategoria) &&
      Object.entries(filtrosAtributos).every(
        ([atributoId, valor]) => !valor || f.atributosFiltro.find((a) => a.atributoId === atributoId)?.valor === valor
      ) &&
      f.nombre.toLowerCase().includes(filtroTexto.toLowerCase())
  );
  const idsVisibles = new Set(visibles.map((f) => f.indicadorId));
  const historicoVisible = (historico ?? []).filter((h) => idsVisibles.has(h.indicadorId));
  const arbol = nodosVisibles(construirArbolSeguimiento(visibles, categoriasCatalogo), colapsadasCategorias);
  const arbolEquipo = nodosVisibles(construirArbolEquipoSeguimiento(visibles, equiposCatalogo, categoriasCatalogo), colapsadasEquipo);
  const columnasPorId = new Map<string, { etiqueta: string; fechaInicio: string }>();
  for (const fila of historicoVisible) {
    for (const p of fila.puntos) columnasPorId.set(p.periodoId, { etiqueta: p.etiqueta, fechaInicio: p.fechaInicio });
  }
  const columnasHistorico = [...columnasPorId.entries()]
    .map(([periodoId, v]) => ({ periodoId, ...v }))
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));

  const conteo = (estado: string): number => filas.filter((f) => f.estado === estado).length;

  const alternarColapsoCategoria = (categoriaId: string): void => {
    setColapsadasCategorias((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(categoriaId)) nuevo.delete(categoriaId);
      else nuevo.add(categoriaId);
      return nuevo;
    });
  };

  const alternarColapsoEquipo = (id: string): void => {
    setColapsadasEquipo((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const alternarSeleccion = (id: string): void => {
    setSeleccionados((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  };

  const alternarSeleccionTodos = (): void => {
    setSeleccionados((previo) => (previo.size === visibles.length ? new Set() : new Set(visibles.map((f) => f.indicadorId))));
  };

  const reasignarSeleccionados = async (cambios: { responsable?: string | null; categoria?: string | null }): Promise<void> => {
    if (seleccionados.size === 0) return;
    setReasignando(true);
    try {
      await invocar('indicadores:reasignarMasivo', { ids: [...seleccionados], ...cambios });
      setSeleccionados(new Set());
      cargarTablero();
    } finally {
      setReasignando(false);
    }
  };

  return (
    <>
      <Encabezado
        titulo="Seguimiento"
        descripcion="Estado de cumplimiento de los levantamientos por indicador. El estado se calcula dinámicamente con la fecha límite configurada."
      />
      {!avisoDescartado && avisosVencimiento.length > 0 && (
        <div className="aviso info" data-testid="aviso-vencimientos" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <strong>{avisosVencimiento.length}</strong> indicador{avisosVencimiento.length === 1 ? '' : 'es'} vencido{avisosVencimiento.length === 1 ? '' : 's'} o próximo{avisosVencimiento.length === 1 ? '' : 's'} a vencer:
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {avisosVencimiento.slice(0, 5).map((a) => (
                <li key={a.indicadorId}>{a.nombre} — {a.motivo === 'Vencido' ? 'vencido' : `vence ${a.fechaLimite}`}</li>
              ))}
              {avisosVencimiento.length > 5 && <li className="texto-suave">y {avisosVencimiento.length - 5} más…</li>}
            </ul>
          </div>
          <button className="boton sutil" onClick={() => setAvisoDescartado(true)} aria-label="Descartar aviso" data-testid="descartar-aviso-vencimientos">
            <Icono nombre="cerrar" tamano={13} />
          </button>
        </div>
      )}
      <div className="filtros-chips">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            className={`filtro-chip ${pestana === p.id ? 'activo' : ''}`}
            onClick={() => setPestana(p.id)}
            data-testid={`pestana-${p.id}`}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <div className="toolbar">
        {pestana === 'estado' && (
          <div className="filtros-chips">
            {FILTROS_ESTADO.map((f) => (
              <button
                key={f.id}
                className={`filtro-chip ${filtroEstado === f.id ? 'activo' : ''}`}
                onClick={() => setFiltroEstado(f.id)}
                data-testid={`filtro-${f.id}`}
              >
                {f.etiqueta}
                {f.id !== 'todos' && ` (${conteo(f.id)})`}
              </button>
            ))}
          </div>
        )}
        <select value={filtroPeriodicidad} onChange={(e) => setFiltroPeriodicidad(e.target.value)} style={{ width: 'auto' }}>
          <option value="todas">Todas las periodicidades</option>
          {periodicidades.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filtroResponsable} onChange={(e) => setFiltroResponsable(e.target.value)} style={{ width: 'auto' }} data-testid="filtro-responsable">
          <option value="todos">Todos los responsables</option>
          {responsablesUnicos.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
        <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ width: 'auto' }} data-testid="filtro-categoria">
          <option value="todas">Todas las categorías</option>
          {categoriasUnicas.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
        {atributosFiltrables.map((a) => (
          <select
            key={a.id}
            value={filtrosAtributos[a.id] ?? ''}
            onChange={(e) => setFiltrosAtributos((previo) => ({ ...previo, [a.id]: e.target.value }))}
            style={{ width: 'auto' }}
            data-testid={`filtro-atributo-${a.nombre}`}
          >
            <option value="">{a.nombre} (todos)</option>
            {(valoresPorAtributo.get(a.id) ?? []).map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        ))}
        <div className="separador" />
        <input type="search" placeholder="Buscar indicador…" value={filtroTexto} onChange={(e) => setFiltroTexto(e.target.value)} />
      </div>

      {pestana === 'estado' && seleccionados.size > 0 && (
        <div className="toolbar" data-testid="barra-reasignacion-masiva">
          <span>{seleccionados.size} indicador(es) seleccionado(s)</span>
          <div className="separador" />
          <select
            defaultValue=""
            disabled={reasignando}
            onChange={(e) => {
              const valor = e.target.value;
              if (valor === '') return;
              void reasignarSeleccionados({ responsable: valor === '__quitar__' ? null : valor });
              e.target.value = '';
            }}
            data-testid="reasignar-responsable"
          >
            <option value="" disabled>Asignar responsable…</option>
            <option value="__quitar__">— quitar asignación —</option>
            {responsablesCatalogo.map((r) => <option key={r.id} value={r.id}>{r.nombreCompleto}</option>)}
          </select>
          <select
            defaultValue=""
            disabled={reasignando}
            onChange={(e) => {
              const valor = e.target.value;
              if (valor === '') return;
              void reasignarSeleccionados({ categoria: valor === '__quitar__' ? null : valor });
              e.target.value = '';
            }}
            data-testid="reasignar-categoria"
          >
            <option value="" disabled>Asignar categoría…</option>
            <option value="__quitar__">— quitar asignación —</option>
            {categoriasCatalogo.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <button className="boton sutil" onClick={() => setSeleccionados(new Set())}>Cancelar selección</button>
        </div>
      )}

      {pestana === 'estado' && (
        <div className="filtros-chips">
          <span className="texto-suave" style={{ alignSelf: 'center' }}>Ver como:</span>
          {VISTAS_ESTADO.map((v) => (
            <button
              key={v.id}
              className={`filtro-chip ${vistaEstado === v.id ? 'activo' : ''}`}
              onClick={() => setVistaEstado(v.id)}
              data-testid={`vista-${v.id}`}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
      )}

      {pestana === 'estado' && vistaEstado === 'lista' && (
      <div className="tabla-envoltura">
        <table className="tabla" data-testid="tabla-seguimiento">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={visibles.length > 0 && seleccionados.size === visibles.length}
                  onChange={alternarSeleccionTodos}
                  data-testid="seleccionar-todos"
                />
              </th>
              <th>Indicador</th>
              <th>Estado</th>
              <th>Periodicidad</th>
              <th>Responsable</th>
              <th>Categoría</th>
              <th>Período pendiente</th>
              <th>Fecha límite</th>
              <th>Fecha de corte</th>
              <th>Progreso</th>
              <th>Última actualización</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr
                key={f.indicadorId}
                style={{ cursor: 'pointer' }}
                onClick={() => void invocar('seguimiento:detalle', { indicadorId: f.indicadorId }).then(setDetalle)}
                data-testid={`seguimiento-${f.nombre}`}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={seleccionados.has(f.indicadorId)}
                    onChange={() => alternarSeleccion(f.indicadorId)}
                    data-testid={`seleccionar-${f.nombre}`}
                  />
                </td>
                <td>
                  <strong>{f.nombre}</strong>
                  {f.codigo && (
                    <div className="texto-suave" style={{ fontSize: '0.85em' }}>
                      {etiquetaConPrefijo(categoriasCatalogo.find((c) => c.id === f.categoriaId)?.prefijo, f.codigo)}
                    </div>
                  )}
                </td>
                <td><ChipEstado estado={f.estado} /></td>
                <td>{f.periodicidad}</td>
                <td className="texto-suave">
                  {f.responsable ?? '—'}
                  {f.responsable && f.equipo && (
                    <>
                      <br />
                      <span style={{ fontSize: '0.8em' }}>({f.equipo})</span>
                    </>
                  )}
                </td>
                <td className="texto-suave">{f.categoria ?? '—'}</td>
                <td>{f.periodoPendiente ?? '—'}</td>
                <td>{f.fechaLimite ?? '—'}</td>
                <td>{f.fechaCorte ?? '—'}</td>
                <td><BarraProgreso valor={f.periodosCompletos} total={f.totalPeriodos} /></td>
                <td className="texto-suave">
                  {f.ultimaActualizacion ? new Date(f.ultimaActualizacion).toLocaleDateString('es') : '—'}
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={11}>
                  {cargando ? (
                    <Vacio mensaje="Cargando…" />
                  ) : (
                    <Vacio icono="▤" mensaje="Sin indicadores que mostrar" detalle="Ajuste los filtros o configure indicadores." />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {pestana === 'estado' && vistaEstado === 'arbol' && (
      <div className="tabla-envoltura">
        <table className="tabla tabla-seguimiento-arbol" data-testid="tabla-seguimiento-arbol">
          <thead>
            <tr>
              <th style={{ width: 32 }} aria-label="Expandir/colapsar" />
              <th>Categoría / Indicador</th>
              <th>Estado</th>
              <th>Periodicidad</th>
              <th>Responsable</th>
              <th>Período pendiente</th>
              <th>Fecha límite</th>
              <th>Fecha de corte</th>
              <th>Progreso</th>
              <th>Última actualización</th>
            </tr>
          </thead>
          <tbody>
            {arbol.map((nodo) => {
              if (nodo.tipo === 'categoria') {
                const colapsada = colapsadasCategorias.has(nodo.id);
                return (
                  <tr key={`c-${nodo.id}`} className="fila-categoria" data-testid={`seguimiento-arbol-categoria-${nodo.nombre}`}>
                    <td className="celda-arbol" style={{ paddingLeft: 6 + nodo.nivel * 18 }}>
                      {nodo.tieneHijos && (
                        <button
                          type="button"
                          className={`boton-arbol ${colapsada ? '' : 'expandido'}`}
                          onClick={() => alternarColapsoCategoria(nodo.id)}
                          title={colapsada ? 'Expandir' : 'Colapsar'}
                          data-testid={`colapsar-categoria-${nodo.nombre}`}
                        >
                          <Icono nombre="flecha" tamano={13} />
                        </button>
                      )}
                    </td>
                    <td colSpan={9}>
                      {etiquetaConPrefijo(nodo.prefijo, nodo.nombre)}
                      <span className="texto-suave" style={{ marginLeft: 8 }}>({nodo.contador})</span>
                    </td>
                  </tr>
                );
              }
              if (nodo.tipo === 'equipo') return null; // Esta vista no agrupa por equipo — ver `arbolEquipo` abajo.
              const f = nodo.fila;
              return (
                <tr
                  key={`i-${nodo.id}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => void invocar('seguimiento:detalle', { indicadorId: f.indicadorId }).then(setDetalle)}
                  data-testid={`seguimiento-${f.nombre}`}
                >
                  <td className="celda-arbol" style={{ paddingLeft: 6 + nodo.nivel * 18 }} />
                  <td>
                    <strong>{f.nombre}</strong>
                    {f.codigo && (
                      <div className="texto-suave" style={{ fontSize: '0.85em' }}>
                        {etiquetaConPrefijo(categoriasCatalogo.find((c) => c.id === f.categoriaId)?.prefijo, f.codigo)}
                      </div>
                    )}
                  </td>
                  <td><ChipEstado estado={f.estado} /></td>
                  <td>{f.periodicidad}</td>
                  <td className="texto-suave">
                  {f.responsable ?? '—'}
                  {f.responsable && f.equipo && (
                    <>
                      <br />
                      <span style={{ fontSize: '0.8em' }}>({f.equipo})</span>
                    </>
                  )}
                </td>
                  <td>{f.periodoPendiente ?? '—'}</td>
                  <td>{f.fechaLimite ?? '—'}</td>
                  <td>{f.fechaCorte ?? '—'}</td>
                  <td><BarraProgreso valor={f.periodosCompletos} total={f.totalPeriodos} /></td>
                  <td className="texto-suave">
                    {f.ultimaActualizacion ? new Date(f.ultimaActualizacion).toLocaleDateString('es') : '—'}
                  </td>
                </tr>
              );
            })}
            {arbol.length === 0 && (
              <tr>
                <td colSpan={10}>
                  {cargando ? (
                    <Vacio mensaje="Cargando…" />
                  ) : (
                    <Vacio icono="▤" mensaje="Sin indicadores que mostrar" detalle="Ajuste los filtros o configure indicadores." />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {pestana === 'estado' && vistaEstado === 'equipo' && (
      <div className="tabla-envoltura">
        <table className="tabla tabla-seguimiento-arbol" data-testid="tabla-seguimiento-equipo">
          <thead>
            <tr>
              <th style={{ width: 32 }} aria-label="Expandir/colapsar" />
              <th>Equipo / Categoría / Indicador</th>
              <th>Estado</th>
              <th>Periodicidad</th>
              <th>Responsable</th>
              <th>Período pendiente</th>
              <th>Fecha límite</th>
              <th>Fecha de corte</th>
              <th>Progreso</th>
              <th>Última actualización</th>
            </tr>
          </thead>
          <tbody>
            {arbolEquipo.map((nodo) => {
              if (nodo.tipo === 'indicador') {
                const f = nodo.fila;
                return (
                  <tr
                    key={`i-${nodo.id}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => void invocar('seguimiento:detalle', { indicadorId: f.indicadorId }).then(setDetalle)}
                    data-testid={`seguimiento-${f.nombre}`}
                  >
                    <td className="celda-arbol" style={{ paddingLeft: 6 + nodo.nivel * 18 }} />
                    <td>
                      <strong>{f.nombre}</strong>
                      {f.codigo && (
                        <div className="texto-suave" style={{ fontSize: '0.85em' }}>
                          {etiquetaConPrefijo(categoriasCatalogo.find((c) => c.id === f.categoriaId)?.prefijo, f.codigo)}
                        </div>
                      )}
                    </td>
                    <td><ChipEstado estado={f.estado} /></td>
                    <td>{f.periodicidad}</td>
                    <td className="texto-suave">
                  {f.responsable ?? '—'}
                  {f.responsable && f.equipo && (
                    <>
                      <br />
                      <span style={{ fontSize: '0.8em' }}>({f.equipo})</span>
                    </>
                  )}
                </td>
                    <td>{f.periodoPendiente ?? '—'}</td>
                    <td>{f.fechaLimite ?? '—'}</td>
                    <td>{f.fechaCorte ?? '—'}</td>
                    <td><BarraProgreso valor={f.periodosCompletos} total={f.totalPeriodos} /></td>
                    <td className="texto-suave">
                      {f.ultimaActualizacion ? new Date(f.ultimaActualizacion).toLocaleDateString('es') : '—'}
                    </td>
                  </tr>
                );
              }
              // Nodo de agrupación (equipo o categoría anidada bajo un equipo) — misma fila visual para ambos.
              const colapsada = colapsadasEquipo.has(nodo.id);
              const etiqueta = nodo.tipo === 'categoria' ? etiquetaConPrefijo(nodo.prefijo, nodo.nombre) : nodo.nombre;
              return (
                <tr
                  key={`g-${nodo.id}`}
                  className="fila-categoria"
                  data-testid={`seguimiento-equipo-${nodo.tipo}-${nodo.nombre}`}
                >
                  <td className="celda-arbol" style={{ paddingLeft: 6 + nodo.nivel * 18 }}>
                    {nodo.tieneHijos && (
                      <button
                        type="button"
                        className={`boton-arbol ${colapsada ? '' : 'expandido'}`}
                        onClick={() => alternarColapsoEquipo(nodo.id)}
                        title={colapsada ? 'Expandir' : 'Colapsar'}
                        data-testid={`colapsar-equipo-${nodo.tipo}-${nodo.nombre}`}
                      >
                        <Icono nombre="flecha" tamano={13} />
                      </button>
                    )}
                  </td>
                  <td colSpan={9}>
                    {etiqueta}
                    <span className="texto-suave" style={{ marginLeft: 8 }}>({nodo.contador})</span>
                  </td>
                </tr>
              );
            })}
            {arbolEquipo.length === 0 && (
              <tr>
                <td colSpan={10}>
                  {cargando ? (
                    <Vacio mensaje="Cargando…" />
                  ) : (
                    <Vacio icono="▤" mensaje="Sin indicadores que mostrar" detalle="Ajuste los filtros o configure indicadores." />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      {pestana === 'historico' && (
        <div className="tabla-envoltura">
          <table className="tabla" data-testid="tabla-historico">
            <thead>
              <tr>
                <th>Indicador</th>
                <th>Línea base</th>
                <th>Meta</th>
                {columnasHistorico.map((c) => (
                  <th key={c.periodoId} title={c.periodoId}>{c.etiqueta}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historicoVisible.map((h) => (
                <tr key={h.indicadorId} data-testid={`historico-${h.nombre}`}>
                  <td><strong>{h.nombre}</strong></td>
                  <td className="texto-suave">{h.lineaBase ?? '—'}{h.lineaBase != null && h.unidadMedida ? ` ${h.unidadMedida}` : ''}</td>
                  <td className="texto-suave">{h.metaGlobal ?? '—'}{h.metaGlobal != null && h.unidadMedida ? ` ${h.unidadMedida}` : ''}</td>
                  {columnasHistorico.map((c) => {
                    const punto = h.puntos.find((p) => p.periodoId === c.periodoId);
                    return (
                      <td key={c.periodoId} data-testid={`historico-${h.nombre}-${c.periodoId}`}>
                        {punto?.valor == null ? (
                          <span className="texto-suave">—</span>
                        ) : (
                          <>
                            {punto.valor}
                            {punto.cumplimientoPct != null && (
                              <div className="texto-suave" style={{ fontSize: '0.85em' }}>{punto.cumplimientoPct.toFixed(0)}% de meta</div>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {historicoVisible.length === 0 && (
                <tr>
                  <td colSpan={3 + columnasHistorico.length}>
                    {cargandoHistorico ? (
                      <Vacio mensaje="Cargando…" />
                    ) : (
                      <Vacio icono="▤" mensaje="Sin resultados históricos" detalle="Ajuste los filtros o capture resultados en Recolección." />
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <PanelLateral titulo={detalle.nombre} alCerrar={() => setDetalle(null)}>
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Estado</th>
                  <th>Fecha límite</th>
                  <th>Avance</th>
                </tr>
              </thead>
              <tbody>
                {detalle.estados.map((e) => (
                  <tr key={e.periodo.id}>
                    <td>{e.periodo.etiqueta}</td>
                    <td><ChipEstado estado={e.estado} /></td>
                    <td>{e.fechaLimite}</td>
                    <td><BarraProgreso valor={e.combinacionesConValor} total={e.totalCombinaciones} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="boton primario"
            onClick={() => navigate(`/recoleccion?indicadorId=${encodeURIComponent(detalle.indicadorId)}`)}
          >
            Ir a la captura
          </button>
        </PanelLateral>
      )}
    </>
  );
}
