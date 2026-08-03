import { useEffect, useRef, useState } from 'react';
import { Encabezado, Campo, Vacio } from '../../componentes/basicos';
import { useRecoleccion } from '../../stores/recoleccion';
import { useNavegacion } from '../../stores/navegacion';

/**
 * Recolección de resultados: edición tipo hoja de cálculo con navegación
 * por teclado, copiar/pegar desde Excel, validación en tiempo real,
 * deshacer/rehacer (Ctrl+Z / Ctrl+Y) y autoguardado — sin botón Guardar.
 */
export function RecoleccionPage(): React.JSX.Element {
  const vm = useRecoleccion();
  const { parametros } = useNavegacion();
  const cuerpoTabla = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    void vm.cargarIndicadores().then(() => {
      if (parametros.indicadorId) void vm.seleccionarIndicador(parametros.indicadorId);
    });
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
  const columnasDesagregacion = captura?.filas.find((f) => !f.esGeneral)?.etiquetas.map((e) => e.listaNombre) ?? [];

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

      {!captura ? (
        <Vacio icono="▦" mensaje="Seleccione un indicador y un período" detalle="para iniciar la captura de resultados" />
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla grilla-captura" data-testid="grilla-captura">
            <thead>
              <tr>
                {columnasDesagregacion.map((c) => <th key={c}>{c}</th>)}
                {columnasDesagregacion.length === 0 && <th>Desagregación</th>}
                <th style={{ textAlign: 'right', width: 160 }}>Resultado — {captura.periodoEtiqueta}</th>
                <th style={{ width: 170 }}>Última modificación</th>
              </tr>
            </thead>
            <tbody ref={cuerpoTabla}>
              {captura.filas.map((fila, indice) => {
                const estado = vm.estadoCeldas.get(fila.claveDesagregacion);
                const error = vm.erroresCeldas.get(fila.claveDesagregacion);
                return (
                  <tr key={fila.claveDesagregacion} className={fila.esGeneral ? 'fila-general' : ''} data-indice={indice}>
                    {fila.esGeneral ? (
                      <td colSpan={Math.max(columnasDesagregacion.length, 1)}>General (total del indicador)</td>
                    ) : (
                      fila.etiquetas.map((e) => <td key={e.listaId}>{e.descripcion}</td>)
                    )}
                    <td
                      className={`celda-editable ${estado ?? ''} ${error ? 'error' : ''}`}
                      title={error}
                    >
                      <CeldaValor
                        clave={fila.claveDesagregacion}
                        valorInicial={fila.valor}
                        invalida={Boolean(error)}
                        alConfirmar={(texto) => void vm.guardarCelda(fila.claveDesagregacion, texto)}
                        alPegar={(texto) => void vm.pegarDesde(indice, texto)}
                        alMover={(delta) => enfocarFila(indice + delta)}
                      />
                    </td>
                    <td className="texto-suave">
                      {fila.actualizadoEn ? new Date(fila.actualizadoEn).toLocaleString('es') : '—'}
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
  clave, valorInicial, invalida, alConfirmar, alPegar, alMover
}: {
  clave: string;
  valorInicial: number | null;
  invalida: boolean;
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
