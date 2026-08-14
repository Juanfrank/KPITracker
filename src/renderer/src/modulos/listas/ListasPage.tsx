import { useCallback, useEffect, useRef, useState } from 'react';
import type { AliasDesagregacionOrigen, ElementoLista, Lista, OrigenAutomatico } from '@domain/index';
import { generarCodigoElemento } from '@domain/index';
import { invocar } from '../../api';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

/**
 * Nombre de esta lista en cada origen automático configurado (reutilizable
 * al mapear columnas del resultado a esta desagregación desde cualquier
 * indicador). Solo aplica a listas ya guardadas.
 */
function SeccionAliasOrigen({ listaId }: { listaId: string }): React.JSX.Element | null {
  const [origenes, setOrigenes] = useState<OrigenAutomatico[]>([]);
  const [alias, setAlias] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    void Promise.all([invocar('origenes:listar', undefined), invocar('listas:aliasOrigen', { listaId })]).then(
      ([origenesCargados, aliasCargados]) => {
        setOrigenes(origenesCargados);
        setAlias(new Map(aliasCargados.map((a) => [a.origenAutomaticoId, a.alias])));
      }
    );
  }, [listaId]);

  const guardar = async (origenAutomaticoId: string, valor: string): Promise<void> => {
    setAlias((previo) => new Map(previo).set(origenAutomaticoId, valor));
    if (!valor.trim()) return;
    const guardado: AliasDesagregacionOrigen = {
      id: '', listaId, origenAutomaticoId, alias: valor, creadoEn: '', actualizadoEn: ''
    };
    await invocar('listas:guardarAliasOrigen', guardado);
  };

  if (origenes.length === 0) return null;

  return (
    <>
      <h4 style={{ margin: '8px 0 0' }}>Nombre en cada origen automático</h4>
      <p className="texto-suave" style={{ margin: 0 }}>
        Cómo se identifica esta desagregación en los datos de cada origen (para sugerir el mapeo de columnas al configurar
        la obtención automática de un indicador). Para orígenes <strong>PowerBI</strong>, use la referencia DAX de la
        columna del modelo — <code>Tabla[Columna]</code> — así el generador de consultas DAX arma la
        consulta completa a partir de ella.
      </p>
      {origenes.map((o) => (
        <div key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ minWidth: 140 }}>{o.nombre}</span>
          <input
            type="text"
            value={alias.get(o.id) ?? ''}
            onChange={(e) => void guardar(o.id, e.target.value)}
            placeholder={o.tipo === 'PowerBI' ? "p. ej. Sexo[Nombre]" : undefined}
            data-testid={`lista-alias-${o.nombre}`}
          />
        </div>
      ))}
    </>
  );
}

function listaVacia(): Lista {
  return {
    id: '',
    nombre: '',
    descripcion: '',
    prefijo: '',
    estado: 'Activa',
    version: 1,
    orden: 0,
    jerarquica: false,
    eliminado: false,
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
  const [mostrarEliminados, setMostrarEliminados] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  // Cola de guardado por fila: evita que dos ediciones casi simultáneas del
  // mismo elemento (p. ej. código y luego nombre) se pisen entre sí si sus
  // respuestas de red llegan en un orden distinto al que se dispararon.
  const colasGuardadoElemento = useRef(new Map<string, Promise<unknown>>());

  const cargar = useCallback(async (): Promise<void> => {
    const datos = await invocar('listas:listar', { incluirEliminados: mostrarEliminados });
    setListas(datos);
  }, [mostrarEliminados]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const seleccionar = async (lista: Lista): Promise<void> => {
    if (lista.eliminado) return;
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

  const eliminarLista = async (id: string): Promise<void> => {
    try {
      await invocar('listas:eliminar', { id });
      setEditando(null);
      setSeleccionada(null);
      setErrores([]);
      await cargar();
    } catch (error) {
      const e = error as Error & { detalles?: string[] };
      setErrores(e.detalles?.length ? e.detalles : [e.message]);
    }
  };

  const restaurarLista = async (id: string): Promise<void> => {
    await invocar('listas:restaurar', { id });
    await cargar();
  };

  const agregarElemento = async (): Promise<ElementoLista | undefined> => {
    if (!seleccionada) return undefined;
    const orden = elementos.length > 0 ? Math.max(...elementos.map((e) => e.orden)) + 1 : 1;
    const nuevo = await invocar('listas:guardarElemento', {
      id: '',
      listaId: seleccionada.id,
      codigo: generarCodigoElemento(seleccionada.prefijo, orden),
      nombre: `Elemento ${orden}`,
      descripcion: '',
      orden,
      padreCodigo: null,
      activo: true
    });
    setElementos([...elementos, nuevo]);
    return nuevo;
  };

  const enfocarCampoElemento = (orden: number, campo: 'codigo' | 'nombre'): void => {
    // Tras crear la fila o navegar, el input recién referenciado puede no existir todavía
    // en el DOM en el mismo tick (re-render pendiente) — se enfoca en el siguiente frame.
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-testid="elemento-${campo}-${orden}"]`);
      input?.focus();
    });
  };

  /**
   * Enter en Código o Nombre navega a la misma columna de la fila
   * siguiente, como en una hoja de cálculo — salvo que ya sea la última
   * fila, caso en el que crea un elemento nuevo (autogenerando su código
   * desde el prefijo de la lista) y enfoca su Nombre, el campo que
   * normalmente se completa a continuación.
   */
  const manejarEnterElemento = async (
    evento: React.KeyboardEvent<HTMLInputElement>, indice: number, campo: 'codigo' | 'nombre'
  ): Promise<void> => {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    const siguiente = elementos[indice + 1];
    if (siguiente) {
      enfocarCampoElemento(siguiente.orden, campo);
      return;
    }
    const nuevo = await agregarElemento();
    if (nuevo) enfocarCampoElemento(nuevo.orden, 'nombre');
  };

  const actualizarElemento = async (elemento: ElementoLista): Promise<void> => {
    // Actualización optimista primero: así, si el usuario edita otro campo de
    // esta misma fila antes de que termine este guardado, ese cambio parte
    // del estado ya fusionado (no de una copia vieja capturada al renderizar).
    setElementos((previos) => previos.map((e) => (e.id === elemento.id ? elemento : e)));
    // Encadenado por fila: las escrituras al mismo elemento se envían en el
    // orden en que el usuario las disparó, nunca en paralelo, para que una
    // respuesta más lenta no sobrescriba con datos obsoletos un cambio más
    // reciente que ya se guardó.
    const cola = colasGuardadoElemento.current.get(elemento.id) ?? Promise.resolve();
    const siguiente = cola.then(() => invocar('listas:guardarElemento', elemento));
    colasGuardadoElemento.current.set(elemento.id, siguiente);
    await siguiente;
  };

  /**
   * Pegado masivo desde Excel: cada línea es [código, nombre] separados por
   * tabulador. Actualiza filas existentes a partir de `indiceInicio` y crea
   * elementos nuevos para las líneas que excedan las ya existentes. Si una
   * fila pegada no trae código, se autogenera desde el prefijo de la lista.
   */
  const pegarElementos = async (indiceInicio: number, textoPortapapeles: string): Promise<void> => {
    if (!seleccionada) return;
    const filas = textoPortapapeles
      .replace(/\r/g, '')
      .split('\n')
      .filter((linea) => linea.trim() !== '');
    let ordenSiguiente = elementos.length > 0 ? Math.max(...elementos.map((e) => e.orden)) : 0;
    const actualizados = [...elementos];

    for (let i = 0; i < filas.length; i++) {
      const [codigoPegado, nombrePegado] = (filas[i] ?? '').split('\t');
      const indice = indiceInicio + i;
      const existente = actualizados[indice];
      if (existente) {
        const guardado = await invocar('listas:guardarElemento', {
          ...existente,
          codigo: codigoPegado?.trim() || existente.codigo,
          nombre: nombrePegado?.trim() ?? existente.nombre
        });
        actualizados[indice] = guardado;
      } else {
        ordenSiguiente += 1;
        const guardado = await invocar('listas:guardarElemento', {
          id: '',
          listaId: seleccionada.id,
          codigo: codigoPegado?.trim() || generarCodigoElemento(seleccionada.prefijo, ordenSiguiente),
          nombre: nombrePegado?.trim() || `Elemento ${ordenSiguiente}`,
          descripcion: '',
          orden: ordenSiguiente,
          padreCodigo: null,
          activo: true
        });
        actualizados.push(guardado);
      }
    }
    setElementos(actualizados);
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
        <div className="separador" />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={mostrarEliminados}
            onChange={(e) => setMostrarEliminados(e.target.checked)}
            style={{ width: 'auto' }}
            data-testid="listas-mostrar-eliminados"
          />
          Mostrar eliminados
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>v</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr
                  key={l.id}
                  className={[seleccionada?.id === l.id ? 'seleccionada' : '', l.eliminado ? 'fila-eliminada' : ''].filter(Boolean).join(' ')}
                  onClick={() => void seleccionar(l)}
                  style={{ cursor: l.eliminado ? 'default' : 'pointer' }}
                  data-testid={`lista-${l.nombre}`}
                >
                  <td>
                    {l.nombre} {l.jerarquica && <span className="texto-suave">(jerárquica)</span>}
                  </td>
                  <td>
                    {l.eliminado ? (
                      <span className="etiqueta-eliminado">Eliminado</span>
                    ) : (
                      <span className={`chip ${l.estado === 'Activa' ? 'completo' : 'noaplica'}`}>{l.estado}</span>
                    )}
                  </td>
                  <td className="texto-suave">{l.version}</td>
                  <td>
                    {l.eliminado && (
                      <button
                        className="boton sutil"
                        title="Restaurar"
                        onClick={(e) => { e.stopPropagation(); void restaurarLista(l.id); }}
                        data-testid={`restaurar-${l.id}`}
                      >
                        Restaurar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={4}>
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
            <p className="texto-suave" style={{ marginTop: 0 }}>
              Puede pegar filas desde Excel (columnas Código y Nombre) en cualquier celda de Código; se crean elementos nuevos si exceden los existentes.
            </p>
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Código</th>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th style={{ width: 70 }}>Orden</th>
                    {seleccionada.jerarquica && <th style={{ width: 130 }}>Padre</th>}
                    <th style={{ width: 70 }}>Activo</th>
                    <th style={{ width: 50 }} />
                  </tr>
                </thead>
                <tbody>
                  {elementos.map((el, indice) => (
                    <tr key={el.id}>
                      <td>
                        <input
                          type="text"
                          value={el.codigo}
                          onChange={(e) => void actualizarElemento({ ...el, codigo: e.target.value })}
                          onPaste={(e) => {
                            const contenido = e.clipboardData.getData('text');
                            if (contenido.includes('\n') || contenido.includes('\t')) {
                              e.preventDefault();
                              void pegarElementos(indice, contenido);
                            }
                          }}
                          onKeyDown={(e) => void manejarEnterElemento(e, indice, 'codigo')}
                          data-testid={`elemento-codigo-${el.orden}`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={el.nombre}
                          onChange={(e) => void actualizarElemento({ ...el, nombre: e.target.value })}
                          onKeyDown={(e) => void manejarEnterElemento(e, indice, 'nombre')}
                          data-testid={`elemento-nombre-${el.orden}`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={el.descripcion}
                          placeholder="Opcional"
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
                                  {p.codigo} — {p.nombre}
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
                      <td colSpan={7}>
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
          alCerrar={() => { setEditando(null); setErrores([]); }}
          pie={
            <>
              <button className="boton" onClick={() => { setEditando(null); setErrores([]); }}>
                Cancelar
              </button>
              <button className="boton primario" onClick={() => void guardarLista()} data-testid="guardar-lista">
                Guardar
              </button>
            </>
          }
        >
          {errores.length > 0 && (
            <div className="aviso error" data-testid="lista-error-eliminar">
              {errores.map((e) => <div key={e}>{e}</div>)}
            </div>
          )}
          <Campo etiqueta="Nombre" obligatorio>
            <input
              type="text"
              value={editando.nombre}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
              data-testid="lista-nombre"
              autoFocus
            />
          </Campo>
          <Campo etiqueta="Prefijo del código" obligatorio>
            <input
              type="text"
              value={editando.prefijo}
              placeholder="Ej.: SEXO"
              onChange={(e) => setEditando({ ...editando, prefijo: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
              data-testid="lista-prefijo"
            />
            <span className="texto-suave">
              Alfabético, en mayúsculas, sin espacios ni caracteres especiales. Único entre listas; genera el código de cada elemento nuevo.
            </span>
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
          {editando.id && <SeccionAliasOrigen listaId={editando.id} />}
          {editando.id && (
            <button className="boton peligro" onClick={() => void eliminarLista(editando.id)}>
              Eliminar lista
            </button>
          )}
        </PanelLateral>
      )}
    </>
  );
}
