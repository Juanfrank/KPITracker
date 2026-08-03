import { useCallback, useEffect, useState } from 'react';
import type { ElementoLista, Lista } from '@domain/index';
import { invocar } from '../../api';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

function listaVacia(): Lista {
  return {
    id: '',
    nombre: '',
    descripcion: '',
    estado: 'Activa',
    version: 1,
    orden: 0,
    jerarquica: false,
    creadoEn: '',
    actualizadoEn: ''
  };
}

/**
 * Listas de selección: base de desagregaciones y atributos de selección.
 * Soporta listas jerárquicas (elemento con padre).
 */
export function ListasPage(): React.JSX.Element {
  const [listas, setListas] = useState<Lista[]>([]);
  const [seleccionada, setSeleccionada] = useState<Lista | null>(null);
  const [elementos, setElementos] = useState<ElementoLista[]>([]);
  const [editando, setEditando] = useState<Lista | null>(null);
  const [filtro, setFiltro] = useState('');

  const cargar = useCallback(async (): Promise<void> => {
    const datos = await invocar('listas:listar', undefined);
    setListas(datos);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const seleccionar = async (lista: Lista): Promise<void> => {
    setSeleccionada(lista);
    setElementos(await invocar('listas:elementos', { listaId: lista.id }));
  };

  const guardarLista = async (): Promise<void> => {
    if (!editando) return;
    const guardada = await invocar('listas:guardar', editando);
    setEditando(null);
    await cargar();
    await seleccionar(guardada);
  };

  const agregarElemento = async (): Promise<void> => {
    if (!seleccionada) return;
    const orden = elementos.length > 0 ? Math.max(...elementos.map((e) => e.orden)) + 1 : 1;
    const nuevo = await invocar('listas:guardarElemento', {
      id: '',
      listaId: seleccionada.id,
      codigo: `E${orden}`,
      descripcion: '',
      orden,
      padreCodigo: null,
      activo: true
    });
    setElementos([...elementos, nuevo]);
  };

  const actualizarElemento = async (elemento: ElementoLista): Promise<void> => {
    await invocar('listas:guardarElemento', elemento);
    setElementos((previos) => previos.map((e) => (e.id === elemento.id ? elemento : e)));
  };

  const filtradas = listas.filter((l) => l.nombre.toLowerCase().includes(filtro.toLowerCase()));

  return (
    <>
      <Encabezado
        titulo="Listas de Selección"
        descripcion="Catálogos administrables que alimentan desagregaciones y atributos de selección. Las listas jerárquicas permiten niveles (país → provincia → municipio)."
        acciones={
          <button className="boton primario" onClick={() => setEditando(listaVacia())} data-testid="nueva-lista">
            <Icono nombre="mas" /> Nueva lista
          </button>
        }
      />
      <div className="toolbar">
        <input type="search" placeholder="Filtrar listas…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>v</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr
                  key={l.id}
                  className={seleccionada?.id === l.id ? 'seleccionada' : ''}
                  onClick={() => void seleccionar(l)}
                  style={{ cursor: 'pointer' }}
                  data-testid={`lista-${l.nombre}`}
                >
                  <td>
                    {l.nombre} {l.jerarquica && <span className="texto-suave">(jerárquica)</span>}
                  </td>
                  <td>
                    <span className={`chip ${l.estado === 'Activa' ? 'completo' : 'noaplica'}`}>{l.estado}</span>
                  </td>
                  <td className="texto-suave">{l.version}</td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <Vacio mensaje="Sin listas" detalle="Cree la primera lista de selección." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {seleccionada ? (
          <div className="tarjeta">
            <div className="toolbar" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Elementos de “{seleccionada.nombre}”</h3>
              <div className="separador" />
              <button className="boton sutil" onClick={() => setEditando(seleccionada)}>
                Editar lista
              </button>
              <button className="boton primario" onClick={() => void agregarElemento()} data-testid="agregar-elemento">
                <Icono nombre="mas" /> Elemento
              </button>
            </div>
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Código</th>
                    <th>Descripción</th>
                    <th style={{ width: 70 }}>Orden</th>
                    {seleccionada.jerarquica && <th style={{ width: 130 }}>Padre</th>}
                    <th style={{ width: 70 }}>Activo</th>
                    <th style={{ width: 50 }} />
                  </tr>
                </thead>
                <tbody>
                  {elementos.map((el) => (
                    <tr key={el.id}>
                      <td>
                        <input
                          type="text"
                          value={el.codigo}
                          onChange={(e) => void actualizarElemento({ ...el, codigo: e.target.value })}
                          data-testid={`elemento-codigo-${el.orden}`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={el.descripcion}
                          onChange={(e) => void actualizarElemento({ ...el, descripcion: e.target.value })}
                          data-testid={`elemento-desc-${el.orden}`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={el.orden}
                          onChange={(e) => void actualizarElemento({ ...el, orden: Number(e.target.value) })}
                        />
                      </td>
                      {seleccionada.jerarquica && (
                        <td>
                          <select
                            value={el.padreCodigo ?? ''}
                            onChange={(e) => void actualizarElemento({ ...el, padreCodigo: e.target.value || null })}
                          >
                            <option value="">— raíz —</option>
                            {elementos
                              .filter((p) => p.id !== el.id)
                              .map((p) => (
                                <option key={p.id} value={p.codigo}>
                                  {p.codigo}
                                </option>
                              ))}
                          </select>
                        </td>
                      )}
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={el.activo}
                          onChange={(e) => void actualizarElemento({ ...el, activo: e.target.checked })}
                          style={{ width: 'auto' }}
                        />
                      </td>
                      <td>
                        <button
                          className="boton sutil"
                          title="Eliminar elemento"
                          onClick={() => {
                            void invocar('listas:eliminarElemento', { id: el.id }).then(() =>
                              setElementos((previos) => previos.filter((x) => x.id !== el.id))
                            );
                          }}
                        >
                          <Icono nombre="cerrar" tamano={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {elementos.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <Vacio mensaje="Lista sin elementos" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <Vacio icono="☰" mensaje="Seleccione una lista" detalle="para administrar sus elementos" />
        )}
      </div>

      {editando && (
        <PanelLateral
          titulo={editando.id ? 'Editar lista' : 'Nueva lista'}
          alCerrar={() => setEditando(null)}
          pie={
            <>
              <button className="boton" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button className="boton primario" onClick={() => void guardarLista()} data-testid="guardar-lista">
                Guardar
              </button>
            </>
          }
        >
          <Campo etiqueta="Nombre" obligatorio>
            <input
              type="text"
              value={editando.nombre}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
              data-testid="lista-nombre"
              autoFocus
            />
          </Campo>
          <Campo etiqueta="Descripción">
            <textarea
              rows={3}
              value={editando.descripcion}
              onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })}
            />
          </Campo>
          <div className="fila-form c2">
            <Campo etiqueta="Estado">
              <select
                value={editando.estado}
                onChange={(e) => setEditando({ ...editando, estado: e.target.value as Lista['estado'] })}
              >
                <option value="Activa">Activa</option>
                <option value="Inactiva">Inactiva</option>
              </select>
            </Campo>
            <Campo etiqueta="Orden">
              <input
                type="number"
                value={editando.orden}
                onChange={(e) => setEditando({ ...editando, orden: Number(e.target.value) })}
              />
            </Campo>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={editando.jerarquica}
              onChange={(e) => setEditando({ ...editando, jerarquica: e.target.checked })}
              style={{ width: 'auto' }}
            />
            Lista jerárquica (elementos con padre)
          </label>
          {editando.id && (
            <button
              className="boton peligro"
              onClick={() => {
                void invocar('listas:eliminar', { id: editando.id }).then(() => {
                  setEditando(null);
                  setSeleccionada(null);
                  void cargar();
                });
              }}
            >
              Eliminar lista
            </button>
          )}
        </PanelLateral>
      )}
    </>
  );
}
