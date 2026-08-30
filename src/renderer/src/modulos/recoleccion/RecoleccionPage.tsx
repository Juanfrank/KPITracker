import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Encabezado, Campo, Vacio } from '../../componentes/basicos';
import { HistorialCelda } from '../../componentes/HistorialCelda';
import { RestaurarPeriodo } from '../../componentes/RestaurarPeriodo';
import { PanelAdjuntos } from '../../componentes/PanelAdjuntos';
import { Icono } from '../../componentes/Icono';
import { useRecoleccion } from '../../stores/recoleccion';
import type { FilaCaptura } from '@application/use-cases/ServicioRecoleccion';

interface FilaVisible {
  fila: FilaCaptura;
  /** Profundidad en el árbol de exploración — coincide con la cantidad de desagregaciones presentes en la fila. */
  nivel: number;
  tieneHijos: boolean;
}

/**
 * Las filas ya llegan del servidor en recorrido en profundidad (DFS
 * pre-order, ver `ArbolDesagregaciones` en el dominio), con `nivel` como
 * profundidad — así que una fila colapsada oculta exactamente el tramo
 * contiguo siguiente cuya profundidad sea mayor que la suya, sin necesitar
 * reconstruir el árbol acá.
 */
function calcularFilasVisibles(filas: FilaCaptura[], colapsadas: Set<string>): FilaVisible[] {
  const visibles: FilaVisible[] = [];
  let ocultarDesdeNivel: number | null = null;
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i]!;
    const nivel = fila.etiquetas.length;
    if (ocultarDesdeNivel !== null) {
      if (nivel > ocultarDesdeNivel) continue;
      ocultarDesdeNivel = null;
    }
    const siguiente = filas[i + 1];
    const tieneHijos = siguiente != null && siguiente.etiquetas.length > nivel;
    visibles.push({ fila, nivel, tieneHijos });
    if (tieneHijos && colapsadas.has(fila.claveDesagregacion)) ocultarDesdeNivel = nivel;
  }
  return visibles;
}

/**
 * Recolección de resultados: edición tipo hoja de cálculo con navegación
 * por teclado, copiar/pegar desde Excel, validación en tiempo real,
 * deshacer/rehacer (Ctrl+Z / Ctrl+Y) y autoguardado — sin botón Guardar.
 */
export function RecoleccionPage(): React.JSX.Element {
  const vm = useRecoleccion();
  const [parametros] = useSearchParams();
  const cuerpoTabla = useRef<HTMLTableSectionElement>(null);
  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set());
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null);
  // Cantidad de adjuntos del levantamiento actual — solo para el resumen del
  // panel colapsable de Comentario/Evidencia (Batch U9); PanelAdjuntos sigue
  // siendo dueño de la lista en sí.
  const [cantidadAdjuntos, setCantidadAdjuntos] = useState(0);

  const manejarValidacion = async (accion: 'validar' | 'rechazar', clave: string): Promise<void> => {
    setErrorValidacion(null);
    try {
      if (accion === 'validar') await vm.validarCelda(clave);
      else await vm.rechazarCelda(clave);
    } catch (error) {
      setErrorValidacion((error as Error).message);
    }
  };

  // Se reinicia solo al cambiar de indicador/período (no en cada autoguardado:
  // `captura` cambia de referencia con cada celda guardada, pero eso no debe
  // volver a expandir todo lo que el usuario ya colapsó).
  useEffect(() => setColapsadas(new Set()), [vm.indicadorId, vm.periodoId]);
  useEffect(() => setCantidadAdjuntos(0), [vm.indicadorId, vm.periodoId]);

  const alternarColapso = (clave: string): void => {
    setColapsadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  };

  useEffect(() => {
    // Con un indicadorId explícito en la navegación (deep link desde Seguimiento,
    // p. ej.), se selecciona ese indicador de cero. Si no, se refresca la selección
    // que ya hubiera en el store (singleton de módulo: sobrevive a haber estado en
    // otra página) sin perderla — ver el docstring de `refrescar` en el store.
    // X2: un `periodoId` opcional junto al indicadorId (botón por fila del panel de
    // detalle de Seguimiento > Estado) va directo a ESE período, no al más reciente.
    const indicadorId = parametros.get('indicadorId');
    const periodoId = parametros.get('periodoId');
    if (indicadorId) {
      void vm.cargarIndicadores().then(() => void vm.seleccionarIndicador(indicadorId, periodoId ?? undefined));
    } else {
      void vm.refrescar();
    }
  }, []);

  useEffect(() => {
    const manejar = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        void vm.deshacer();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        void vm.rehacer();
      }
    };
    window.addEventListener('keydown', manejar);
    return () => window.removeEventListener('keydown', manejar);
  }, []);

  const enfocarFila = (indice: number): void => {
    const entrada = cuerpoTabla.current?.querySelector<HTMLInputElement>(`tr[data-indice="${indice}"] input`);
    entrada?.focus();
    entrada?.select();
  };

  const captura = vm.captura;
  // Las columnas de la grilla salen de TODAS las desagregaciones activas del indicador
  // (no de las etiquetas de una fila cualquiera): con subtotales, la primera fila que no
  // es General puede tener menos etiquetas que el total (las demás vienen enrolladas).
  const desagregacionesActivas = captura?.desagregacionesDisponibles.filter((d) => !d.excluida) ?? [];
  const indicadorSeleccionado = vm.indicadores.find((i) => i.id === vm.indicadorId);
  const filasVisibles = captura ? calcularFilasVisibles(captura.filas, colapsadas) : [];

  return (
    <>
      <Encabezado
        titulo="Recolección de Resultados"
        descripcion="Registre los resultados por período. Todo cambio se guarda automáticamente; puede pegar columnas completas desde Excel."
      />
      <div className="tarjeta">
        <div className="fila-form c4">
          <Campo etiqueta="Indicador" obligatorio>
            <select
              value={vm.indicadorId ?? ''}
              onChange={(e) => e.target.value && void vm.seleccionarIndicador(e.target.value)}
              data-testid="recoleccion-indicador"
            >
              <option value="">— seleccionar —</option>
              {vm.indicadores.map((i) => (
                <option key={i.id} value={i.id}>{i.nombre}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Período" obligatorio>
            <select
              value={vm.periodoId ?? ''}
              onChange={(e) => e.target.value && void vm.seleccionarPeriodo(e.target.value)}
              disabled={!vm.indicadorId}
              data-testid="recoleccion-periodo"
            >
              <option value="">— seleccionar —</option>
              {vm.periodos.map((p) => (
                <option key={p.id} value={p.id}>{p.etiqueta}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Fecha de corte" obligatorio>
            <input
              type="date"
              value={captura?.fechaCorte ?? ''}
              disabled={!captura}
              onChange={(e) => void vm.establecerFechaCorte(e.target.value || null)}
              data-testid="recoleccion-fecha-corte"
            />
            <span className="texto-suave">Única y compartida por todas las desagregaciones del período.</span>
          </Campo>
          {captura && vm.indicadorId && vm.periodoId && !indicadorSeleccionado?.esCalculado && (
            // X5: misma fila que Indicador/Período/Fecha de corte (antes vivía en un toolbar aparte,
            // más abajo) y restylado como HistorialCelda — ver RestaurarPeriodo.tsx.
            <Campo etiqueta="Restaurar período">
              <RestaurarPeriodo
                key={`${vm.indicadorId}-${vm.periodoId}`}
                indicadorId={vm.indicadorId}
                periodoId={vm.periodoId}
                clavesDesagregacion={captura.filas.map((f) => f.claveDesagregacion)}
                alRestaurar={(t) => vm.restaurarPeriodo(t)}
              />
            </Campo>
          )}
        </div>
        {captura && !indicadorSeleccionado?.esCalculado && (
          // Colapsado por defecto (Batch U9): el comentario y la evidencia no
          // son parte del flujo de captura del día a día, pero su ausencia/
          // presencia debe notarse sin tener que desplegar el panel.
          <details className="tarjeta-colapsable" style={{ marginTop: 10 }} data-testid="panel-comentario-evidencia">
            <summary data-testid="resumen-comentario-evidencia">
              <span>Comentario y evidencia</span>
              {captura.comentario && <span className="chip" data-testid="resumen-con-comentario">💬 con comentario</span>}
              {cantidadAdjuntos > 0 && (
                <span className="chip" data-testid="resumen-cantidad-adjuntos">
                  📎 {cantidadAdjuntos} {cantidadAdjuntos === 1 ? 'adjunto' : 'adjuntos'}
                </span>
              )}
            </summary>
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              <Campo etiqueta="Comentario del levantamiento">
                <ComentarioLevantamiento
                  valorInicial={captura.comentario}
                  alConfirmar={(texto) => void vm.establecerComentario(texto || null)}
                />
                <span className="texto-suave">Opcional, uno solo por indicador y período (no por celda).</span>
              </Campo>
              {vm.indicadorId && vm.periodoId && (
                <PanelAdjuntos
                  entidad="Levantamiento"
                  entidadId={`${vm.indicadorId}:${vm.periodoId}`}
                  maxArchivos={1}
                  titulo="Evidencia adjunta (opcional)"
                  alCambiarCantidad={setCantidadAdjuntos}
                />
              )}
            </div>
          </details>
        )}
        {captura && vm.automatizacionConfigurada && !indicadorSeleccionado?.esCalculado && (
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="boton" onClick={() => void vm.obtenerAutomatico()} data-testid="recoleccion-obtener-automatico">
              Obtener automáticamente
            </button>
            <span className="texto-suave">Consulta el origen configurado para este indicador y este período.</span>
          </div>
        )}
        {vm.mensajeAutomatico && (
          <div className="aviso info" data-testid="aviso-obtener-automatico">{vm.mensajeAutomatico}</div>
        )}
        {captura && captura.desagregacionesDisponibles.length > 0 && (
          <div className="toolbar" style={{ marginTop: 10 }}>
            <span className="texto-suave">Desagregaciones de este levantamiento:</span>
            <div className="filtros-chips">
              {captura.desagregacionesDisponibles.map((d) => (
                <button
                  key={d.listaId}
                  className={`filtro-chip ${d.excluida ? '' : 'activo'}`}
                  title={d.excluida ? 'Excluida temporalmente en este período' : 'Incluida'}
                  onClick={() => void vm.alternarExclusion(d.listaId, !d.excluida)}
                  data-testid={`exclusion-${d.nombre}`}
                >
                  {d.excluida ? '✕ ' : '✓ '}{d.nombre}
                </button>
              ))}
            </div>
            <span className="texto-suave">La exclusión es temporal: no modifica la configuración del indicador.</span>
          </div>
        )}
      </div>

      {captura && indicadorSeleccionado?.esCalculado && (
        <div className="aviso info">
          Este indicador es calculado a partir de su fórmula ({indicadorSeleccionado.formula}); su valor se obtiene automáticamente y no admite captura manual.
        </div>
      )}

      {captura && !indicadorSeleccionado?.esCalculado && !captura.fechaCorte && (
        <div className="aviso info" data-testid="aviso-fecha-corte-requerida">
          Establezca la fecha de corte para habilitar la captura de resultados.
        </div>
      )}

      {errorValidacion && (
        <div className="aviso error" data-testid="error-validacion">{errorValidacion}</div>
      )}

      {captura && captura.advertencias.length > 0 && (
        <div className="aviso info" data-testid="advertencias-captura">
          {captura.advertencias.map((a) => (
            <div key={a}>⚠ {a}</div>
          ))}
        </div>
      )}

      {!captura ? (
        <Vacio icono="▦" mensaje="Seleccione un indicador y un período" detalle="para iniciar la captura de resultados" />
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla grilla-captura" data-testid="grilla-captura">
            <thead>
              <tr>
                <th style={{ width: 32 }} aria-label="Expandir/colapsar" />
                {desagregacionesActivas.map((d) => <th key={d.listaId}>{d.nombre}</th>)}
                {desagregacionesActivas.length === 0 && <th>Desagregación</th>}
                <th style={{ textAlign: 'right', width: 160 }}>Resultado — {captura.periodoEtiqueta}</th>
                <th style={{ width: 170 }}>Última modificación</th>
                {indicadorSeleccionado?.requiereValidacion !== false && <th style={{ width: 150 }}>Validación</th>}
              </tr>
            </thead>
            <tbody ref={cuerpoTabla}>
              {filasVisibles.map((entrada, indice) => {
                const fila = entrada.fila;
                const estado = vm.estadoCeldas.get(fila.claveDesagregacion);
                const error = vm.erroresCeldas.get(fila.claveDesagregacion);
                const conflicto = vm.conflictosCeldas.get(fila.claveDesagregacion);
                const colapsada = colapsadas.has(fila.claveDesagregacion);
                const clases = [fila.esGeneral ? 'fila-general' : '', fila.esSubtotal ? 'fila-subtotal' : ''].filter(Boolean).join(' ');
                return (
                  <tr key={fila.claveDesagregacion} className={clases} data-indice={indice}>
                    <td className="celda-arbol" style={{ paddingLeft: 6 + entrada.nivel * 18 }}>
                      {entrada.tieneHijos && (
                        <button
                          type="button"
                          className={`boton-arbol ${colapsada ? '' : 'expandido'}`}
                          onClick={() => alternarColapso(fila.claveDesagregacion)}
                          title={colapsada ? 'Expandir' : 'Colapsar'}
                          data-testid={`colapsar-${fila.claveDesagregacion}`}
                        >
                          <Icono nombre="flecha" tamano={13} />
                        </button>
                      )}
                    </td>
                    {fila.esGeneral ? (
                      <td colSpan={Math.max(desagregacionesActivas.length, 1)}>
                        {indicadorSeleccionado?.esCalculado ? 'Valor calculado' : 'General (total del indicador)'}
                      </td>
                    ) : (
                      desagregacionesActivas.map((d) => {
                        const etiqueta = fila.etiquetas.find((e) => e.listaId === d.listaId);
                        return etiqueta ? (
                          <td key={d.listaId}>{etiqueta.descripcion}</td>
                        ) : (
                          <td key={d.listaId} className="celda-enrollada" title={`Subtotal: todas las opciones de "${d.nombre}"`}>Todos</td>
                        );
                      })
                    )}
                    <td
                      className={`celda-editable ${estado ?? ''} ${error ? 'error' : ''}`}
                      title={conflicto ? undefined : error}
                    >
                      {conflicto ? (
                        // Concurrencia (bloqueo optimista): alguien más cambió este valor mientras se
                        // editaba — se bloquea la escritura y se ofrece recargar, en vez de sobrescribir
                        // en silencio ("última escritura gana") o fusionar valores.
                        <div className="conflicto-concurrencia" data-testid={`conflicto-${fila.claveDesagregacion}`}>
                          <span>
                            Cambiado por {conflicto.capturadoPor ?? 'otra persona'} el{' '}
                            {new Date(conflicto.capturadoEn).toLocaleString('es')} — ahora es{' '}
                            {conflicto.valorActual ?? '(vacío)'}.
                          </span>
                          <button
                            type="button"
                            className="boton sutil"
                            onClick={() => void vm.recargarTrasConflicto(fila.claveDesagregacion)}
                            data-testid={`recargar-${fila.claveDesagregacion}`}
                          >
                            Recargar
                          </button>
                        </div>
                      ) : indicadorSeleccionado?.esCalculado ? (
                        <span data-testid={`celda-${fila.claveDesagregacion}`}>{fila.valor ?? '—'}</span>
                      ) : (
                        <CeldaValor
                          clave={fila.claveDesagregacion}
                          valorInicial={fila.valor}
                          invalida={Boolean(error)}
                          deshabilitada={!captura.fechaCorte}
                          alConfirmar={(texto) => void vm.guardarCelda(fila.claveDesagregacion, texto)}
                          alPegar={(texto) => void vm.pegarDesde(
                            filasVisibles.slice(indice).map((e) => e.fila.claveDesagregacion),
                            texto
                          )}
                          alMover={(delta) => enfocarFila(indice + delta)}
                        />
                      )}
                    </td>
                    <td className="texto-suave" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                      {fila.actualizadoEn ? new Date(fila.actualizadoEn).toLocaleString('es') : '—'}
                      {!indicadorSeleccionado?.esCalculado && vm.indicadorId && vm.periodoId && (
                        <HistorialCelda
                          indicadorId={vm.indicadorId}
                          periodoId={vm.periodoId}
                          claveDesagregacion={fila.claveDesagregacion}
                          alRestaurar={(version) => vm.restaurarVersion(fila.claveDesagregacion, version)}
                        />
                      )}
                    </td>
                    {indicadorSeleccionado?.requiereValidacion !== false && (
                      <td>
                        {fila.valor != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              className={`chip ${fila.estadoValidacion.toLowerCase()}`}
                              title={fila.comentarioValidacion ?? undefined}
                              data-testid={`validacion-${fila.claveDesagregacion}`}
                            >
                              {fila.estadoValidacion}
                            </span>
                            {fila.estadoValidacion !== 'Validado' && (
                              <button
                                type="button"
                                className="boton sutil"
                                title="Validar"
                                onClick={() => void manejarValidacion('validar', fila.claveDesagregacion)}
                                data-testid={`validar-${fila.claveDesagregacion}`}
                              >
                                ✓
                              </button>
                            )}
                            {fila.estadoValidacion !== 'Rechazado' && (
                              <button
                                type="button"
                                className="boton sutil"
                                title="Rechazar"
                                onClick={() => void manejarValidacion('rechazar', fila.claveDesagregacion)}
                                data-testid={`rechazar-${fila.claveDesagregacion}`}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {captura && (
        <p className="texto-suave">
          <span className="atajo">Enter</span> / <span className="atajo">↑↓</span> navegar ·{' '}
          <span className="atajo">Ctrl+V</span> pegar columna desde Excel ·{' '}
          <span className="atajo">Ctrl+Z</span> deshacer · <span className="atajo">Ctrl+Y</span> rehacer · Autoguardado activo
        </p>
      )}
    </>
  );
}

/** Celda editable: estado local mientras se escribe, confirmación al salir o con Enter. */
function CeldaValor({
  clave, valorInicial, invalida, deshabilitada, alConfirmar, alPegar, alMover
}: {
  clave: string;
  valorInicial: number | null;
  invalida: boolean;
  /** Deshabilitada mientras no se haya establecido la fecha de corte del período. */
  deshabilitada?: boolean;
  alConfirmar: (texto: string) => void;
  alPegar: (texto: string) => void;
  alMover: (delta: number) => void;
}): React.JSX.Element {
  const [texto, setTexto] = useState(valorInicial == null ? '' : String(valorInicial));
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (!editando) setTexto(valorInicial == null ? '' : String(valorInicial));
  }, [valorInicial, editando]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={texto}
      className={invalida ? 'invalido' : ''}
      disabled={deshabilitada}
      title={deshabilitada ? 'Establezca la fecha de corte para habilitar la captura.' : undefined}
      data-testid={`celda-${clave}`}
      onFocus={() => setEditando(true)}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        setEditando(false);
        alConfirmar(texto);
      }}
      onPaste={(e) => {
        const contenido = e.clipboardData.getData('text');
        if (contenido.includes('\n') || contenido.includes('\t')) {
          e.preventDefault();
          alPegar(contenido);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'ArrowDown') {
          e.preventDefault();
          alConfirmar(texto);
          alMover(1);
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          alConfirmar(texto);
          alMover(-1);
        }
        if (e.key === 'Escape') {
          setTexto(valorInicial == null ? '' : String(valorInicial));
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** Comentario de todo el levantamiento (indicador+período): estado local, confirmación al salir del campo. */
function ComentarioLevantamiento({
  valorInicial, alConfirmar
}: {
  valorInicial: string | null;
  alConfirmar: (texto: string) => void;
}): React.JSX.Element {
  const [texto, setTexto] = useState(valorInicial ?? '');
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (!editando) setTexto(valorInicial ?? '');
  }, [valorInicial, editando]);

  return (
    <textarea
      rows={2}
      value={texto}
      placeholder="Comentario opcional para este indicador y período."
      onFocus={() => setEditando(true)}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        setEditando(false);
        alConfirmar(texto);
      }}
      data-testid="recoleccion-comentario"
    />
  );
}
