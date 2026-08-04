import { useEffect, useState } from 'react';
import type { Atributo, AutomatizacionIndicador, OrigenAutomatico, ParametroDinamico, Periodo } from '@domain/index';
import type { ResultadoTabular } from '@application/ports/index';
import type { ReporteConciliacion } from '@domain/services/ConciliacionLista';
import { invocar } from '../../api';
import { Campo, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

const SENTINELA_VALOR = '__valor__';
const SENTINELA_IGNORAR = '__ignorar__';

function configVacia(indicadorId: string, origenAutomaticoId: string): AutomatizacionIndicador {
  return {
    id: '', indicadorId, origenAutomaticoId, parametrosDinamicos: [], script: '', columnaValor: null,
    mapeoColumnas: [], desagregacionesOmitidas: [], creadoEn: '', actualizadoEn: ''
  };
}

/**
 * Configuración de la obtención automática de un indicador: parámetros
 * dinámicos (de sus propios atributos), script, ejecución de prueba,
 * mapeo del resultado tabular a las desagregaciones y conciliación de
 * valores contra la lista oficial de cada una.
 */
export function ModalAutomatizacionIndicador({
  indicadorId, indicadorNombre, atributos, desagregaciones, listas, alCerrar
}: {
  indicadorId: string;
  indicadorNombre: string;
  atributos: Atributo[];
  desagregaciones: string[];
  listas: { id: string; nombre: string }[];
  alCerrar: () => void;
}): React.JSX.Element {
  const [origenes, setOrigenes] = useState<OrigenAutomatico[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [periodoId, setPeriodoId] = useState('');
  const [config, setConfig] = useState<AutomatizacionIndicador | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ejecutando, setEjecutando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoTabular | null>(null);
  const [errorEjecucion, setErrorEjecucion] = useState<string | null>(null);
  const [conciliaciones, setConciliaciones] = useState<Map<string, ReporteConciliacion>>(new Map());
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void Promise.all([
      invocar('origenes:listar', undefined),
      invocar('recoleccion:periodos', { indicadorId }),
      invocar('automatizacion:obtener', { indicadorId })
    ]).then(([origenesCargados, periodosCargados, configExistente]) => {
      setOrigenes(origenesCargados);
      setPeriodos(periodosCargados);
      setPeriodoId(periodosCargados[periodosCargados.length - 1]?.id ?? '');
      setConfig(configExistente ?? (origenesCargados[0] ? configVacia(indicadorId, origenesCargados[0].id) : null));
      setCargando(false);
    });
  }, [indicadorId]);

  const origen = origenes.find((o) => o.id === config?.origenAutomaticoId) ?? null;
  const listaPorId = new Map(listas.map((l) => [l.id, l]));
  const tokensDisponibles = [
    ...(origen?.parametrosGenerales.map((p) => p.nombre) ?? []),
    ...(config?.parametrosDinamicos.map((p) => p.nombre).filter((n) => n) ?? [])
  ];

  const actualizar = (cambio: Partial<AutomatizacionIndicador>): void => {
    setConfig((previo) => (previo ? { ...previo, ...cambio } : previo));
  };

  const agregarParametroDinamico = (): void => {
    if (!config) return;
    actualizar({ parametrosDinamicos: [...config.parametrosDinamicos, { nombre: '', atributoId: atributos[0]?.id ?? '' }] });
  };

  const actualizarParametroDinamico = (indice: number, cambio: Partial<ParametroDinamico>): void => {
    if (!config) return;
    actualizar({ parametrosDinamicos: config.parametrosDinamicos.map((p, i) => (i === indice ? { ...p, ...cambio } : p)) });
  };

  const eliminarParametroDinamico = (indice: number): void => {
    if (!config) return;
    actualizar({ parametrosDinamicos: config.parametrosDinamicos.filter((_, i) => i !== indice) });
  };

  const ejecutar = async (): Promise<void> => {
    if (!config || !periodoId) return;
    setEjecutando(true);
    setErrorEjecucion(null);
    setResultado(null);
    setConciliaciones(new Map());
    try {
      const tabular = await invocar('automatizacion:ejecutarPrueba', {
        indicadorId, periodoId, origenAutomaticoId: config.origenAutomaticoId,
        parametrosDinamicos: config.parametrosDinamicos, script: config.script
      });
      setResultado(tabular);
    } catch (error) {
      setErrorEjecucion((error as Error).message);
    } finally {
      setEjecutando(false);
    }
  };

  const listaIdDeColumna = (columna: string): string | null => {
    const mapeo = config?.mapeoColumnas.find((m) => m.columna === columna);
    return mapeo?.listaId ?? null;
  };

  const asignarColumna = (columna: string, valor: string): void => {
    if (!config) return;
    if (valor === SENTINELA_VALOR) {
      actualizar({ columnaValor: columna, mapeoColumnas: config.mapeoColumnas.filter((m) => m.columna !== columna) });
      return;
    }
    const sinValor = config.columnaValor === columna ? null : config.columnaValor;
    const sinEstaColumna = config.mapeoColumnas.filter((m) => m.columna !== columna);
    if (valor === SENTINELA_IGNORAR) {
      actualizar({ columnaValor: sinValor, mapeoColumnas: sinEstaColumna });
      return;
    }
    actualizar({ columnaValor: sinValor, mapeoColumnas: [...sinEstaColumna, { columna, listaId: valor }] });
  };

  const desagregacionesSinMapear = desagregaciones.filter(
    (listaId) => !config?.mapeoColumnas.some((m) => m.listaId === listaId)
  );

  const validarColumna = async (listaId: string, columna: string): Promise<void> => {
    if (!resultado) return;
    const valoresUnicos = [...new Set(resultado.filas.map((f) => f[columna] ?? '').filter((v) => v))];
    const reporte = await invocar('automatizacion:validarColumna', { listaId, valoresUnicos });
    setConciliaciones((previo) => new Map(previo).set(listaId, reporte));
  };

  const agregarFaltantes = async (listaId: string): Promise<void> => {
    const reporte = conciliaciones.get(listaId);
    if (!reporte || reporte.noEncontrados.length === 0) return;
    await invocar('automatizacion:agregarElementosFaltantes', { listaId, codigos: reporte.noEncontrados });
    const columna = config?.mapeoColumnas.find((m) => m.listaId === listaId)?.columna;
    if (columna) await validarColumna(listaId, columna);
  };

  const alternarOmitida = (listaId: string, omitir: boolean): void => {
    if (!config) return;
    actualizar({
      desagregacionesOmitidas: omitir
        ? [...config.desagregacionesOmitidas, listaId]
        : config.desagregacionesOmitidas.filter((id) => id !== listaId)
    });
  };

  const guardar = async (): Promise<void> => {
    if (!config) return;
    if (!config.origenAutomaticoId) {
      setMensaje({ tipo: 'error', texto: 'Seleccione un origen.' });
      return;
    }
    const sinOmitirNiMapear = desagregacionesSinMapear.filter((id) => !config.desagregacionesOmitidas.includes(id));
    if (sinOmitirNiMapear.length > 0) {
      const nombres = sinOmitirNiMapear.map((id) => listaPorId.get(id)?.nombre ?? id).join(', ');
      setMensaje({ tipo: 'error', texto: `Mapee o marque como omitidas estas desagregaciones antes de guardar: ${nombres}.` });
      return;
    }
    setGuardando(true);
    try {
      await invocar('automatizacion:guardar', config);
      setMensaje({ tipo: 'exito', texto: 'Configuración guardada.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: (error as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <PanelLateral titulo={`Obtención automática — ${indicadorNombre}`} alCerrar={alCerrar}>
      {cargando || !config ? (
        <Vacio mensaje={cargando ? 'Cargando…' : 'No hay orígenes automáticos configurados'} detalle={cargando ? undefined : 'Cree uno primero en Administración.'} />
      ) : (
        <>
          {mensaje && <div className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</div>}

          <Campo etiqueta="Origen" obligatorio>
            <select
              value={config.origenAutomaticoId}
              onChange={(e) => actualizar({ origenAutomaticoId: e.target.value, mapeoColumnas: [], columnaValor: null })}
              data-testid="automatizacion-origen"
            >
              {origenes.map((o) => <option key={o.id} value={o.id}>{o.nombre} ({o.tipo})</option>)}
            </select>
          </Campo>

          <h4 style={{ margin: '8px 0 0' }}>1. Parámetros dinámicos</h4>
          <p className="texto-suave" style={{ margin: 0 }}>
            Atributos específicos de este indicador que se sustituyen en el script (junto a los parámetros generales del período).
          </p>
          {config.parametrosDinamicos.map((p, indice) => (
            <div key={indice} style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                placeholder="nombre del token"
                value={p.nombre}
                onChange={(e) => actualizarParametroDinamico(indice, { nombre: e.target.value })}
                data-testid={`automatizacion-parametro-nombre-${indice}`}
                style={{ flex: 1 }}
              />
              <select
                value={p.atributoId}
                onChange={(e) => actualizarParametroDinamico(indice, { atributoId: e.target.value })}
                data-testid={`automatizacion-parametro-atributo-${indice}`}
                style={{ flex: 1 }}
              >
                {atributos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
              <button className="boton sutil" onClick={() => eliminarParametroDinamico(indice)}>
                <Icono nombre="cerrar" tamano={13} />
              </button>
            </div>
          ))}
          <button className="boton sutil" style={{ justifySelf: 'start' }} onClick={agregarParametroDinamico} data-testid="automatizacion-agregar-parametro">
            <Icono nombre="mas" tamano={13} /> Agregar parámetro dinámico
          </button>

          <h4 style={{ margin: '8px 0 0' }}>2. Script</h4>
          {tokensDisponibles.length > 0 && (
            <p className="texto-suave" style={{ margin: 0 }}>
              Tokens disponibles: {tokensDisponibles.map((t) => `{${t}}`).join('  ')}
            </p>
          )}
          <textarea
            rows={4}
            value={config.script}
            placeholder="SELECT sexo, COUNT(*) AS total FROM casos WHERE anio = {anio} AND mes = {mesNum}"
            onChange={(e) => actualizar({ script: e.target.value })}
            data-testid="automatizacion-script"
          />

          <h4 style={{ margin: '8px 0 0' }}>3. Ejecutar</h4>
          <div className="fila-form c2">
            <Campo etiqueta="Período de prueba">
              <select value={periodoId} onChange={(e) => setPeriodoId(e.target.value)} data-testid="automatizacion-periodo">
                {periodos.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
              </select>
            </Campo>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="boton primario" onClick={() => void ejecutar()} disabled={ejecutando || !periodoId} data-testid="automatizacion-ejecutar">
                {ejecutando ? 'Ejecutando…' : 'Ejecutar script'}
              </button>
            </div>
          </div>
          {errorEjecucion && <div className="aviso error" data-testid="automatizacion-error">{errorEjecucion}</div>}

          {resultado && (
            <>
              <h4 style={{ margin: '8px 0 0' }}>4. Mapeo de columnas a desagregaciones</h4>
              <div className="tabla-envoltura">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Columna del resultado</th>
                      <th>Corresponde a</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.columnas.map((columna) => {
                      const listaId = listaIdDeColumna(columna);
                      const valorSelect = config.columnaValor === columna ? SENTINELA_VALOR : (listaId ?? SENTINELA_IGNORAR);
                      return (
                        <tr key={columna}>
                          <td><code>{columna}</code></td>
                          <td>
                            <select
                              value={valorSelect}
                              onChange={(e) => asignarColumna(columna, e.target.value)}
                              data-testid={`automatizacion-mapeo-${columna}`}
                            >
                              <option value={SENTINELA_IGNORAR}>— ignorar —</option>
                              <option value={SENTINELA_VALOR}>Es el valor del resultado</option>
                              {desagregaciones.map((id) => (
                                <option key={id} value={id}>{listaPorId.get(id)?.nombre ?? id}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {desagregaciones.map((listaId) => {
                const columna = config.mapeoColumnas.find((m) => m.listaId === listaId)?.columna;
                if (!columna) return null;
                const reporte = conciliaciones.get(listaId);
                return (
                  <div key={listaId} className="tarjeta" style={{ padding: 12 }}>
                    <div className="toolbar">
                      <strong>{listaPorId.get(listaId)?.nombre ?? listaId}</strong>
                      <div className="separador" />
                      <button className="boton sutil" onClick={() => void validarColumna(listaId, columna)} data-testid={`automatizacion-validar-${listaId}`}>
                        Validar valores
                      </button>
                    </div>
                    {reporte && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 13 }}>
                        <div>
                          <div className="texto-suave">Coinciden ({reporte.coincidentes.length})</div>
                          {reporte.coincidentes.join(', ') || '—'}
                        </div>
                        <div>
                          <div className="texto-suave">Sin dato en el resultado ({reporte.sinDatoEnResultado.length})</div>
                          {reporte.sinDatoEnResultado.join(', ') || '—'}
                        </div>
                        <div>
                          <div className="texto-suave">No están en la lista ({reporte.noEncontrados.length})</div>
                          {reporte.noEncontrados.join(', ') || '—'}
                          {reporte.noEncontrados.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              <button className="boton sutil" onClick={() => void agregarFaltantes(listaId)} data-testid={`automatizacion-agregar-faltantes-${listaId}`}>
                                Agregar a la lista
                              </button>
                              <span className="texto-suave" style={{ marginLeft: 6 }}>
                                o descártelos dejando el mapeo así (las filas con estos valores se saltarán al ejecutar).
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {desagregacionesSinMapear.length > 0 && (
            <div className="aviso info" data-testid="automatizacion-sin-mapear">
              <strong>Desagregaciones sin mapear:</strong>
              {desagregacionesSinMapear.map((listaId) => (
                <label key={listaId} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto' }}
                    checked={config.desagregacionesOmitidas.includes(listaId)}
                    onChange={(e) => alternarOmitida(listaId, e.target.checked)}
                    data-testid={`automatizacion-omitir-${listaId}`}
                  />
                  Omitir {listaPorId.get(listaId)?.nombre ?? listaId} (se completará manualmente)
                </label>
              ))}
            </div>
          )}

          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="boton" onClick={alCerrar} data-testid="automatizacion-cerrar">Cerrar</button>
            <button className="boton primario" onClick={() => void guardar()} disabled={guardando} data-testid="automatizacion-guardar">
              {guardando ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </>
      )}
    </PanelLateral>
  );
}
