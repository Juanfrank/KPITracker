import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Encabezado, Campo, Vacio } from '../../componentes/basicos';
import { HistorialCelda } from '../../componentes/HistorialCelda';
import { PanelAdjuntos } from '../../componentes/PanelAdjuntos';
import { useRecoleccion } from '../../stores/recoleccion';

/**
 * Recolección de resultados: edición tipo hoja de cálculo con navegación
 * por teclado, copiar/pegar desde Excel, validación en tiempo real,
 * deshacer/rehacer (Ctrl+Z / Ctrl+Y) y autoguardado — sin botón Guardar.
 */
export function RecoleccionPage(): React.JSX.Element {
  const vm = useRecoleccion();
  const [parametros] = useSearchParams();
  const cuerpoTabla = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    // Con un indicadorId explícito en la navegación (deep link desde Seguimiento,
    // p. ej.), se selecciona ese indicador de cero. Si no, se refresca la selección
    // que ya hubiera en el store (singleton de módulo: sobrevive a haber estado en
    // otra página) sin perderla — ver el docstring de `refrescar` en el store.
    const indicadorId = parametros.get('indicadorId');
    if (indicadorId) {
      void vm.cargarIndicadores().then(() => void vm.seleccionarIndicador(indicadorId));
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

  return (
    <>
      <Encabezado
        titulo="Recolección de Resultados"
        descripcion="Registre los resultados por período. Todo cambio se guarda automáticamente; puede pegar columnas completas desde Excel."
      />
      <div className="tarjeta">
        <div className="fila-form c3">
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
        </div>
        {captura && !indicadorSeleccionado?.esCalculado && (
          <div className="fila-form c1" style={{ marginTop: 10 }}>
            <Campo etiqueta="Comentario del levantamiento">
              <ComentarioLevantamiento
                valorInicial={captura.comentario}
                alConfirmar={(texto) => void vm.establecerComentario(texto || null)}
              />
              <span className="texto-suave">Opcional, uno solo por indicador y período (no por celda).</span>
            </Campo>
          </div>
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
        {captura && !indicadorSeleccionado?.esCalculado && vm.indicadorId && vm.periodoId && (
          <div style={{ marginTop: 10 }}>
            <PanelAdjuntos
              entidad="Levantamiento"
              entidadId={`${vm.indicadorId}:${vm.periodoId}`}
              maxArchivos={1}
              titulo="Evidencia adjunta (opcional)"
            />
          </div>
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
                {desagregacionesActivas.map((d) => <th key={d.listaId}>{d.nombre}</th>)}
                {desagregacionesActivas.length === 0 && <th>Desagregación</th>}
                <th style={{ textAlign: 'right', width: 160 }}>Resultado — {captura.periodoEtiqueta}</th>
                <th style={{ width: 170 }}>Última modificación</th>
              </tr>
            </thead>
            <tbody ref={cuerpoTabla}>
              {captura.filas.map((fila, indice) => {
                const estado = vm.estadoCeldas.get(fila.claveDesagregacion);
                const error = vm.erroresCeldas.get(fila.claveDesagregacion);
                const clases = [fila.esGeneral ? 'fila-general' : '', fila.esSubtotal ? 'fila-subtotal' : ''].filter(Boolean).join(' ');
                return (
                  <tr key={fila.claveDesagregacion} className={clases} data-indice={indice}>
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
                      title={error}
                    >
                      {indicadorSeleccionado?.esCalculado ? (
                        <span data-testid={`celda-${fila.claveDesagregacion}`}>{fila.valor ?? '—'}</span>
                      ) : (
                        <CeldaValor
                          clave={fila.claveDesagregacion}
                          valorInicial={fila.valor}
                          invalida={Boolean(error)}
                          deshabilitada={!captura.fechaCorte}
                          alConfirmar={(texto) => void vm.guardarCelda(fila.claveDesagregacion, texto)}
                          alPegar={(texto) => void vm.pegarDesde(indice, texto)}
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
