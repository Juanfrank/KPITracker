import { useEffect, useState } from 'react';
import type { Categoria, Responsable } from '@domain/index';
import type { FilaTablero, DetalleSeguimiento } from '@application/use-cases/ServicioSeguimiento';
import { invocar } from '../../api';
import { BarraProgreso, ChipEstado, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { useNavegacion } from '../../stores/navegacion';

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
  const [filas, setFilas] = useState<FilaTablero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroPeriodicidad, setFiltroPeriodicidad] = useState('todas');
  const [filtroResponsable, setFiltroResponsable] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroTexto, setFiltroTexto] = useState('');
  const [detalle, setDetalle] = useState<DetalleSeguimiento | null>(null);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [responsablesCatalogo, setResponsablesCatalogo] = useState<Responsable[]>([]);
  const [categoriasCatalogo, setCategoriasCatalogo] = useState<Categoria[]>([]);
  const [reasignando, setReasignando] = useState(false);
  const { navegar } = useNavegacion();

  const cargarTablero = (): void => {
    void invocar('seguimiento:tablero', undefined)
      .then(setFilas)
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargarTablero();
    void invocar('responsables:listar', undefined).then(setResponsablesCatalogo);
    void invocar('categorias:listar', undefined).then(setCategoriasCatalogo);
  }, []);

  const periodicidades = [...new Set(filas.map((f) => f.periodicidad))];
  const responsablesUnicos = [...new Map(filas.filter((f) => f.responsableId).map((f) => [f.responsableId as string, f.responsable ?? f.responsableId as string])).entries()];
  const categoriasUnicas = [...new Map(filas.filter((f) => f.categoriaId).map((f) => [f.categoriaId as string, f.categoria ?? f.categoriaId as string])).entries()];
  const visibles = filas.filter(
    (f) =>
      (filtroEstado === 'todos' || f.estado === filtroEstado) &&
      (filtroPeriodicidad === 'todas' || f.periodicidad === filtroPeriodicidad) &&
      (filtroResponsable === 'todos' || f.responsableId === filtroResponsable) &&
      (filtroCategoria === 'todas' || f.categoriaId === filtroCategoria) &&
      f.nombre.toLowerCase().includes(filtroTexto.toLowerCase())
  );

  const conteo = (estado: string): number => filas.filter((f) => f.estado === estado).length;

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
      <div className="toolbar">
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
        <div className="separador" />
        <input type="search" placeholder="Buscar indicador…" value={filtroTexto} onChange={(e) => setFiltroTexto(e.target.value)} />
      </div>

      {seleccionados.size > 0 && (
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
            {responsablesCatalogo.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
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
                <td><strong>{f.nombre}</strong></td>
                <td><ChipEstado estado={f.estado} /></td>
                <td>{f.periodicidad}</td>
                <td className="texto-suave">{f.responsable ?? '—'}</td>
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
            onClick={() => navegar('recoleccion', { indicadorId: detalle.indicadorId })}
          >
            Ir a la captura
          </button>
        </PanelLateral>
      )}
    </>
  );
}
