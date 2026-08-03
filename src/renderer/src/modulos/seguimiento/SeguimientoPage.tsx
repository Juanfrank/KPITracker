import { useEffect, useState } from 'react';
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
  const { navegar } = useNavegacion();

  useEffect(() => {
    void invocar('seguimiento:tablero', undefined)
      .then(setFilas)
      .finally(() => setCargando(false));
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

      <div className="tabla-envoltura">
        <table className="tabla" data-testid="tabla-seguimiento">
          <thead>
            <tr>
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
