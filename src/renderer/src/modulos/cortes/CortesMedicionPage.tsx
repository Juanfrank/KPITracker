import { useCallback, useEffect, useState } from 'react';
import type { CorteMedicion, Indicador, TipoAgregacion } from '@domain/index';
import { ETIQUETAS_AGREGACION, OPCIONES_AGREGACION_CORTES, PERIODICIDADES_CORTE } from '@domain/index';
import { invocar } from '../../api';
import { trpcClient } from '../../trpc';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';

function corteVacio(): CorteMedicion {
  return {
    id: '', nombre: '', periodicidad: PERIODICIDADES_CORTE[1]!, reglaGeneral: 'promedio', reglasPorIndicador: {},
    // Ambos toggles encendidos por defecto (pedido explícito del usuario, Batch AA).
    omitirPeriodosSinMeta: true, acotarAl100: true, creadoEn: '', actualizadoEn: ''
  };
}

/**
 * "Cortes de medición" (Batch Y/Z, rediseñado en Batch AA a pedido explícito
 * del usuario): módulo propio en el menú lateral, debajo de "Metas" — antes
 * vivía embebido dentro de Configuración de Metas, pero un corte agrega
 * RESULTADOS capturados (no metas/objetivos) de TODOS los indicadores a la
 * vez, así que conceptualmente nunca dependió del indicador elegido ahí.
 *
 * Un corte ya no es una fecha puntual: es una PERIODICIDAD recurrente
 * superior al mes (Bimestral..Anual). Cada período de esa periodicidad
 * ("T1 2026", "T2 2026"...) es un bucket que agrega, con una regla de
 * agregación (general o específica por indicador), los períodos más finos
 * de cada indicador cuya ventana cae dentro de la suya — ver
 * `ServicioCortesMedicion.calcular`.
 *
 * (Nota, Batch AA: agrupar/colapsar columnas por corte en una grilla vive
 * en Seguimiento → Histórico, no acá — ver `SeguimientoPage.tsx`.)
 *
 * (Nota, Batch AB, pedido explícito del usuario: un corte NO se "calcula"
 * bajo demanda — es un valor dinámico, función de los resultados
 * capturados en cada momento. Por eso esta página es pura configuración
 * (CRUD); el valor agregado de cada corte se ve donde tiene sentido verlo
 * en contexto — la celda colapsada de un grupo de corte en Seguimiento →
 * Histórico, calculada en vivo cada vez que se muestra.)
 */
export function CortesMedicionPage(): React.JSX.Element {
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [cortes, setCortes] = useState<CorteMedicion[]>([]);
  const [editando, setEditando] = useState<CorteMedicion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarCortes = useCallback(async (): Promise<void> => {
    setCortes(await trpcClient.cortesMedicion.listar.query());
  }, []);

  useEffect(() => {
    void invocar('indicadores:listar', undefined).then((todos) => setIndicadores(todos.filter((i) => i.estado === 'Activo' && !i.esCalculado)));
    void cargarCortes();
  }, [cargarCortes]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    setError(null);
    try {
      await trpcClient.cortesMedicion.guardar.mutate(editando);
      setEditando(null);
      await cargarCortes();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el corte de medición.');
    }
  };

  const eliminar = async (id: string): Promise<void> => {
    setError(null);
    try {
      await trpcClient.cortesMedicion.eliminar.mutate({ id });
      setEditando(null);
      await cargarCortes();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el corte de medición.');
    }
  };

  const establecerReglaIndicador = (indicadorId: string, regla: string): void => {
    if (!editando) return;
    const reglasPorIndicador = { ...editando.reglasPorIndicador };
    if (regla) reglasPorIndicador[indicadorId] = regla as TipoAgregacion;
    else delete reglasPorIndicador[indicadorId];
    setEditando({ ...editando, reglasPorIndicador });
  };

  return (
    <>
      <Encabezado
        titulo="Cortes de medición"
        descripcion='Momentos globales, recurrentes, donde se agrega todo lo capturado — cada corte es una periodicidad superior al mes (p. ej. "Trimestral"); cada uno de sus períodos agrega los períodos más finos de cada indicador que caen dentro de su ventana.'
      />
      <div className="tarjeta">
        <div className="toolbar">
          <span className="texto-suave">{cortes.length} corte(s) de medición configurado(s)</span>
          <div className="separador" />
          <button className="boton primario" onClick={() => setEditando(corteVacio())} data-testid="nuevo-corte-medicion">
            + Corte
          </button>
        </div>
        <div className="tabla-envoltura">
          <table className="tabla" data-testid="tabla-cortes-medicion">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Periodicidad</th>
                <th>Regla general</th>
              </tr>
            </thead>
            <tbody>
              {cortes.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setEditando(c)} data-testid={`corte-medicion-${c.nombre}`}>
                  <td>{c.nombre}</td>
                  <td>{c.periodicidad}</td>
                  <td>{ETIQUETAS_AGREGACION[c.reglaGeneral]}</td>
                </tr>
              ))}
              {cortes.length === 0 && (
                <tr><td colSpan={3}><Vacio mensaje="Sin cortes de medición" detalle="cree uno con “+ Corte”" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="texto-suave" style={{ margin: '8px 0 0' }}>
          El valor agregado de cada corte es dinámico — se calcula en vivo a partir de los resultados capturados. Se ve en
          contexto en Seguimiento → Histórico, activando el corte en el filtro "Cortes de medición" y colapsando su grupo.
        </p>
      </div>

      {editando && (
        <PanelLateral
          titulo={editando.id ? `Editar corte — ${editando.nombre}` : 'Nuevo corte de medición'}
          alCerrar={() => { setEditando(null); setError(null); }}
          pie={
            <>
              {editando.id && <button className="boton peligro" onClick={() => void eliminar(editando.id)}>Eliminar</button>}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => { setEditando(null); setError(null); }}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-corte-medicion">Guardar</button>
            </>
          }
        >
          {error && <div className="aviso error">{error}</div>}
          <Campo etiqueta="Nombre" obligatorio>
            <input
              type="text"
              value={editando.nombre}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
              autoFocus
              data-testid="corte-nombre"
            />
          </Campo>
          <Campo etiqueta="Periodicidad" obligatorio>
            <select
              value={editando.periodicidad}
              onChange={(e) => setEditando({ ...editando, periodicidad: e.target.value as CorteMedicion['periodicidad'] })}
              data-testid="corte-periodicidad"
            >
              {PERIODICIDADES_CORTE.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Regla general">
            <select
              value={editando.reglaGeneral}
              onChange={(e) => setEditando({ ...editando, reglaGeneral: e.target.value as TipoAgregacion })}
              data-testid="corte-regla-general"
            >
              {OPCIONES_AGREGACION_CORTES.map((op) => <option key={op} value={op}>{ETIQUETAS_AGREGACION[op]}</option>)}
            </select>
          </Campo>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginTop: 8 }}>
            <input
              type="checkbox"
              checked={editando.omitirPeriodosSinMeta}
              onChange={(e) => setEditando({ ...editando, omitirPeriodosSinMeta: e.target.checked })}
              style={{ width: 'auto' }}
              data-testid="corte-omitir-sin-meta"
            />
            Omitir períodos sin meta
          </label>
          <p className="texto-suave" style={{ marginTop: 4, fontSize: 13 }}>
            El cálculo agrega el % de cumplimiento respecto de la meta de cada período (valor ÷ meta) —
            un período sin meta configurada no tiene % posible y siempre queda fuera, más allá de esta opción.
          </p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginTop: 8 }}>
            <input
              type="checkbox"
              checked={editando.acotarAl100}
              onChange={(e) => setEditando({ ...editando, acotarAl100: e.target.checked })}
              style={{ width: 'auto' }}
              data-testid="corte-acotar-100"
            />
            Acotar cada resultado participante al 100%
          </label>
          <p className="texto-suave" style={{ marginTop: 4, fontSize: 13 }}>
            Acota el % de cumplimiento de cada período ANTES de agregarlo — un sobre-cumplimiento puntual
            (p. ej. 150%) no "arrastra hacia arriba" el promedio combinado de los demás períodos del bucket.
          </p>

          <Campo etiqueta="Reglas específicas por indicador">
            <div className="tabla-envoltura">
              <table className="tabla">
                <thead><tr><th>Indicador</th><th>Regla</th></tr></thead>
                <tbody>
                  {indicadores.map((i) => (
                    <tr key={i.id}>
                      <td>{i.nombre}</td>
                      <td>
                        <select
                          value={editando.reglasPorIndicador[i.id] ?? ''}
                          onChange={(e) => establecerReglaIndicador(i.id, e.target.value)}
                          data-testid={`corte-regla-indicador-${i.nombre}`}
                        >
                          <option value="">— usar regla general —</option>
                          {OPCIONES_AGREGACION_CORTES.map((op) => <option key={op} value={op}>{ETIQUETAS_AGREGACION[op]}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Campo>
        </PanelLateral>
      )}
    </>
  );
}
