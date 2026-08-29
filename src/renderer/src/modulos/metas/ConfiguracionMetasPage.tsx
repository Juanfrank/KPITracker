import { useCallback, useEffect, useRef, useState } from 'react';
import type { CorteMedicion, DefinicionPeriodicidad, ElementoLista, Indicador, Meta, Periodo, ResultadoCorteMedicion, TipoAgregacion } from '@domain/index';
import { ETIQUETAS_AGREGACION, GeneradorPeriodos, OPCIONES_AGREGACION, Periodicidad, ProductoCartesiano, claveATexto } from '@domain/index';
import { invocar } from '../../api';
import { trpcClient } from '../../trpc';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';

const generadorPeriodos = new GeneradorPeriodos();
const productoCartesiano = new ProductoCartesiano();
const PERIODICIDADES = Object.values(Periodicidad);
const METODOS_CALCULO: Meta['metodoCalculo'][] = ['Promedio', 'Sumatoria', 'UltimoValor', 'Maximo', 'Minimo'];

type Combinacion = ReturnType<typeof productoCartesiano.generar>[number];

function etiquetaCombinacion(combinacion: Combinacion, listasPorId: Map<string, { nombre: string }>): string {
  if (combinacion.etiquetas.length === 0) return 'General (total del indicador)';
  return combinacion.etiquetas.map((e) => `${listasPorId.get(e.listaId)?.nombre ?? e.listaId}: ${e.descripcion}`).join(' / ');
}

/** Modo de generación de metas automáticas (Batch X, X14). */
type ModoMetaAutomatica = 'constante' | 'incrementoAbsoluto' | 'decrementoAbsoluto' | 'incrementoPorcentual' | 'decrementoPorcentual';

const ETIQUETAS_MODO_AUTO: Record<ModoMetaAutomatica, string> = {
  constante: 'Mismo valor en todos los períodos',
  incrementoAbsoluto: 'Subir N entre períodos',
  decrementoAbsoluto: 'Bajar N entre períodos',
  incrementoPorcentual: 'Subir N% entre períodos',
  decrementoPorcentual: 'Bajar N% entre períodos'
};

/** Valor objetivo del `paso`-ésimo período (0 = el inicial) según el modo elegido, redondeado a 2 decimales. */
function valorAutomatico(valorInicial: number, modo: ModoMetaAutomatica, incremento: number, paso: number): number {
  let valor: number;
  switch (modo) {
    case 'incrementoAbsoluto': valor = valorInicial + incremento * paso; break;
    case 'decrementoAbsoluto': valor = valorInicial - incremento * paso; break;
    case 'incrementoPorcentual': valor = valorInicial * Math.pow(1 + incremento / 100, paso); break;
    case 'decrementoPorcentual': valor = valorInicial * Math.pow(1 - incremento / 100, paso); break;
    default: valor = valorInicial;
  }
  return Math.round(valor * 100) / 100;
}

/**
 * Configuración de Metas: igual que Recolección elige un indicador y
 * muestra sus combinaciones de desagregación como filas, pero en vez de
 * capturar UN resultado a la vez, aquí se define el VALOR OBJETIVO de
 * cada período de la recurrencia elegida — todos a la vista en una sola
 * grilla, con pegado estilo Excel. La primera columna ("Recurrente",
 * Batch X X11) edita el valor que aplica por defecto a TODOS los períodos
 * de esa periodicidad/año — antes solo se podía definir desde la sección
 * "Metas" del formulario de Indicadores, retirada de ahí para que la
 * gestión de metas viva únicamente en este módulo. Un override puntual
 * por período (columnas siguientes) tiene prioridad sobre el recurrente
 * (ver `metaVigenteParaPeriodo`); dejar la celda vacía borra ese override
 * puntual y el período vuelve a tomar el valor recurrente (mostrado
 * atenuado como referencia).
 *
 * Batch X (X10): la periodicidad ya NO se elige aquí — se ciñe siempre a
 * la periodicidad configurada en el propio indicador (se muestra fija,
 * deshabilitada, solo como referencia); antes se podía elegir cualquier
 * periodicidad de forma independiente, permitiendo metas "Trimestral"
 * sobre un indicador "Mensual" que nunca podían corresponder a un período
 * real de captura. "Año" pasa de un input numérico libre a un dropdown,
 * igual que ya lo era la periodicidad.
 */
export function ConfiguracionMetasPage(): React.JSX.Element {
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [indicadorId, setIndicadorId] = useState<string | null>(null);
  const [listas, setListas] = useState<{ id: string; nombre: string; estado: string }[]>([]);
  const [elementosPorLista, setElementosPorLista] = useState<Map<string, ElementoLista[]>>(new Map());
  const [periodicidades, setPeriodicidades] = useState<DefinicionPeriodicidad[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [anioInicialConfig, setAnioInicialConfig] = useState<number>(new Date().getFullYear());
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [metodoCalculo, setMetodoCalculo] = useState<Meta['metodoCalculo']>('Promedio');
  // Debounce por celda (misma disciplina que IndicadoresPage/ListasPage, Batch U8):
  // actualiza el estado local al instante, difiere la escritura de red.
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Establecer metas automáticamente (Batch X, X14).
  const [autoDesagregacion, setAutoDesagregacion] = useState('GENERAL');
  const [autoValor, setAutoValor] = useState('');
  const [autoPeriodoInicialId, setAutoPeriodoInicialId] = useState('');
  const [autoModo, setAutoModo] = useState<ModoMetaAutomatica>('constante');
  const [autoIncremento, setAutoIncremento] = useState('');
  const [autoMensaje, setAutoMensaje] = useState<string | null>(null);

  useEffect(() => {
    void invocar('indicadores:listar', undefined).then((todos) => setIndicadores(todos.filter((i) => i.estado === 'Activo' && !i.esCalculado)));
    void invocar('listas:listar', undefined).then(setListas);
    void invocar('periodicidades:listar', undefined).then(setPeriodicidades);
    void invocar('config:obtener', undefined).then((c) => {
      setAnioInicialConfig(c.anioInicial);
      setAnio(c.anioInicial);
    });
  }, []);

  const indicador = indicadores.find((i) => i.id === indicadorId) ?? null;
  // Ceñido al indicador (X10): nunca es una elección independiente del usuario.
  const periodicidad = indicador?.periodicidad ?? Periodicidad.Mensual;
  const periodicidadPersonalizadaId = indicador?.periodicidadPersonalizadaId ?? null;

  // Dropdown de años (X10): del inicio configurado (Configuración General)
  // hasta el año siguiente al actual — mismo rango que ya usa la exportación
  // analítica — más el año actualmente elegido, por si quedó fuera de ese
  // rango (p. ej. una meta antigua de un año antes del `anioInicial` vigente).
  const anioActual = new Date().getFullYear();
  const anios = [...new Set(
    Array.from({ length: Math.max(anioActual + 1 - anioInicialConfig + 1, 0) }, (_, i) => anioInicialConfig + i).concat(anio)
  )].sort((a, b) => a - b);

  const seleccionarIndicador = async (id: string): Promise<void> => {
    setIndicadorId(id || null);
    if (!id) {
      setMetas([]);
      return;
    }
    setMetas(await invocar('metas:listar', { indicadorId: id }));
  };

  useEffect(() => {
    const ids = indicador?.desagregaciones ?? [];
    const pendientes = ids.filter((id) => !elementosPorLista.has(id));
    if (pendientes.length === 0) return;
    void Promise.all(pendientes.map((id) => invocar('listas:elementos', { listaId: id }).then((els) => [id, els] as const))).then(
      (pares) => setElementosPorLista((previo) => new Map([...previo, ...pares]))
    );
  }, [indicador, elementosPorLista]);

  const definicionPersonalizada =
    periodicidad === Periodicidad.Personalizada && periodicidadPersonalizadaId
      ? periodicidades.find((d) => d.id === periodicidadPersonalizadaId)
      : undefined;

  let periodos: Periodo[] = [];
  let errorPeriodos: string | null = null;
  if (indicador) {
    if (periodicidad === Periodicidad.Personalizada && !definicionPersonalizada) {
      errorPeriodos = 'El indicador no tiene una definición de periodicidad personalizada válida configurada. Corríjala en Indicadores.';
    } else {
      periodos = generadorPeriodos.periodosDelAnio(anio, periodicidad, definicionPersonalizada);
    }
  }

  const combinaciones = indicador ? productoCartesiano.generar(indicador.desagregaciones, elementosPorLista) : [];
  const listasPorId = new Map(listas.map((l) => [l.id, l]));

  const obtenerCelda = (clave: string, periodoId: string): Meta | undefined =>
    metas.find((m) => m.claveDesagregacion === clave && m.periodoId === periodoId);

  /** Meta recurrente vigente para (clave, periodicidad, año) — se muestra como referencia (placeholder) cuando no hay override puntual. */
  const obtenerRecurrente = (clave: string): Meta | undefined =>
    metas.find(
      (m) =>
        m.claveDesagregacion === clave &&
        m.periodoId === null &&
        m.anioVigencia === anio &&
        m.periodicidadMedicion === periodicidad &&
        (periodicidad !== Periodicidad.Personalizada || m.periodicidadPersonalizadaId === periodicidadPersonalizadaId)
    );

  const guardarCeldaMeta = (meta: Meta): void => {
    setMetas((previas) => (previas.some((m) => m.id === meta.id) ? previas.map((m) => (m.id === meta.id ? meta : m)) : [...previas, meta]));
    const anterior = temporizadores.current.get(meta.id);
    if (anterior) clearTimeout(anterior);
    temporizadores.current.set(
      meta.id,
      setTimeout(() => {
        temporizadores.current.delete(meta.id);
        void invocar('metas:guardar', meta);
      }, 500)
    );
  };

  const eliminarCeldaMeta = (meta: Meta): void => {
    const temporizador = temporizadores.current.get(meta.id);
    if (temporizador) {
      clearTimeout(temporizador);
      temporizadores.current.delete(meta.id);
    }
    setMetas((previas) => previas.filter((m) => m.id !== meta.id));
    void invocar('metas:eliminar', { id: meta.id });
  };

  /** Vacío borra el override puntual (si existía) y el período vuelve a la recurrente; un número crea o actualiza la meta de ese período. */
  const manejarCambioCelda = (clave: string, periodo: Periodo, texto: string): void => {
    if (!indicador) return;
    const existente = obtenerCelda(clave, periodo.id);
    const limpio = texto.trim();
    if (limpio === '') {
      if (existente) eliminarCeldaMeta(existente);
      return;
    }
    const valor = Number(limpio);
    if (Number.isNaN(valor)) return;
    if (existente) {
      guardarCeldaMeta({ ...existente, valor });
    } else {
      guardarCeldaMeta({
        id: crypto.randomUUID(),
        indicadorId: indicador.id,
        claveDesagregacion: clave,
        valor,
        periodicidadMedicion: periodicidad,
        periodicidadPersonalizadaId: periodicidad === Periodicidad.Personalizada ? periodicidadPersonalizadaId : null,
        metodoCalculo,
        anioVigencia: anio,
        periodoId: periodo.id,
        creadoEn: '',
        actualizadoEn: ''
      });
    }
  };

  /** Pegado estilo Excel: filas = combinaciones desde la celda pegada, columnas = períodos desde la celda pegada. */
  const pegarBloque = (indiceFilaInicio: number, indiceColInicio: number, texto: string): void => {
    const lineas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    for (let f = 0; f < lineas.length; f++) {
      const fila = combinaciones[indiceFilaInicio + f];
      if (!fila) break;
      const clave = claveATexto(fila.clave);
      const columnas = (lineas[f] ?? '').split('\t');
      for (let c = 0; c < columnas.length; c++) {
        const periodo = periodos[indiceColInicio + c];
        if (!periodo) break;
        manejarCambioCelda(clave, periodo, columnas[c] ?? '');
      }
    }
  };

  /** Vacío borra la meta recurrente (si existía); un número la crea o actualiza — aplica a TODOS los períodos de la periodicidad/año elegidos. */
  const manejarCambioRecurrente = (clave: string, texto: string): void => {
    if (!indicador) return;
    const existente = obtenerRecurrente(clave);
    const limpio = texto.trim();
    if (limpio === '') {
      if (existente) eliminarCeldaMeta(existente);
      return;
    }
    const valor = Number(limpio);
    if (Number.isNaN(valor)) return;
    if (existente) {
      guardarCeldaMeta({ ...existente, valor });
    } else {
      guardarCeldaMeta({
        id: crypto.randomUUID(),
        indicadorId: indicador.id,
        claveDesagregacion: clave,
        valor,
        periodicidadMedicion: periodicidad,
        periodicidadPersonalizadaId: periodicidad === Periodicidad.Personalizada ? periodicidadPersonalizadaId : null,
        metodoCalculo,
        anioVigencia: anio,
        periodoId: null,
        creadoEn: '',
        actualizadoEn: ''
      });
    }
  };

  /** Pegado estilo Excel sobre la columna "Recurrente": una fila por combinación, desde la celda pegada hacia abajo. */
  const pegarColumnaRecurrente = (indiceFilaInicio: number, texto: string): void => {
    const lineas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    for (let f = 0; f < lineas.length; f++) {
      const fila = combinaciones[indiceFilaInicio + f];
      if (!fila) break;
      const clave = claveATexto(fila.clave);
      manejarCambioRecurrente(clave, (lineas[f] ?? '').split('\t')[0] ?? '');
    }
  };

  // Valores efectivos del panel "Establecer metas automáticamente": si lo elegido dejó de ser
  // válido (cambió de indicador, año o desagregaciones), cae a la primera opción disponible en
  // vez de quedar apuntando a algo que ya no existe en esta grilla.
  const autoDesagregacionEfectiva = combinaciones.some((c) => claveATexto(c.clave) === autoDesagregacion)
    ? autoDesagregacion
    : claveATexto(combinaciones[0]?.clave ?? { pares: [] });
  const autoPeriodoInicialEfectivo = periodos.some((p) => p.id === autoPeriodoInicialId) ? autoPeriodoInicialId : (periodos[0]?.id ?? '');

  /**
   * Genera valores objetivo para el período elegido y todos los siguientes
   * (dentro del año/periodicidad visibles) a partir de un valor inicial y un
   * modo de variación — mismo valor, subir/bajar una cantidad fija, o
   * subir/bajar un porcentaje, entre cada período consecutivo. Escribe cada
   * celda como override puntual (mismo camino que editarla a mano).
   */
  const aplicarMetasAutomaticas = (): void => {
    if (!indicador) return;
    const valorInicial = Number(autoValor);
    if (autoValor.trim() === '' || Number.isNaN(valorInicial)) {
      setAutoMensaje('Ingrese un valor inicial válido.');
      return;
    }
    const incremento = Number(autoIncremento || '0');
    if (autoModo !== 'constante' && (autoIncremento.trim() === '' || Number.isNaN(incremento))) {
      setAutoMensaje('Ingrese la cantidad o porcentaje entre períodos.');
      return;
    }
    const indiceInicial = periodos.findIndex((p) => p.id === autoPeriodoInicialEfectivo);
    if (indiceInicial === -1) {
      setAutoMensaje('Seleccione un período inicial válido.');
      return;
    }
    for (let i = indiceInicial; i < periodos.length; i++) {
      const valor = valorAutomatico(valorInicial, autoModo, incremento, i - indiceInicial);
      manejarCambioCelda(autoDesagregacionEfectiva, periodos[i]!, String(valor));
    }
    const cantidad = periodos.length - indiceInicial;
    setAutoMensaje(`${cantidad} período(s) actualizado(s) desde "${periodos[indiceInicial]!.etiqueta}".`);
  };

  return (
    <>
      <Encabezado
        titulo="Configuración de Metas"
        descripcion='Defina el valor objetivo de cada período, según la periodicidad configurada en el propio indicador. Un valor puntual por período tiene prioridad sobre el recurrente (columna "Recurrente"); déjelo vacío para volver a ese valor recurrente.'
      />
      <div className="tarjeta">
        <div className="fila-form c4">
          <Campo etiqueta="Indicador" obligatorio>
            <select value={indicadorId ?? ''} onChange={(e) => void seleccionarIndicador(e.target.value)} data-testid="configuracion-metas-indicador">
              <option value="">— seleccionar —</option>
              {indicadores.map((i) => (
                <option key={i.id} value={i.id}>{i.nombre}</option>
              ))}
            </select>
          </Campo>
          {/* Ceñida al indicador (X10): ya no es una elección — se muestra fija/deshabilitada, solo como referencia. */}
          <Campo etiqueta="Periodicidad (del indicador)">
            <select value={periodicidad} disabled data-testid="configuracion-metas-periodicidad">
              {PERIODICIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Año">
            <select
              value={anio}
              disabled={!indicador}
              onChange={(e) => setAnio(Number(e.target.value))}
              data-testid="configuracion-metas-anio"
            >
              {anios.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Método (nuevas celdas)">
            <select
              value={metodoCalculo}
              disabled={!indicador}
              onChange={(e) => setMetodoCalculo(e.target.value as Meta['metodoCalculo'])}
              data-testid="configuracion-metas-metodo"
            >
              {METODOS_CALCULO.map((mc) => <option key={mc} value={mc}>{mc}</option>)}
            </select>
          </Campo>
        </div>
        {periodicidad === Periodicidad.Personalizada && indicador && definicionPersonalizada && (
          <p className="texto-suave" style={{ margin: '8px 0 0' }}>
            Definición personalizada: <strong>{definicionPersonalizada.nombre}</strong> (configurada en el indicador).
          </p>
        )}
      </div>

      <SeccionCortesMedicion indicadores={indicadores} />

      {indicador && !errorPeriodos && (
        <div className="tarjeta" data-testid="panel-metas-automaticas">
          <h3 style={{ marginTop: 0 }}>Establecer metas automáticamente</h3>
          <p className="texto-suave" style={{ marginTop: 0 }}>
            Genera el valor objetivo de un período y todos los siguientes (del año/periodicidad visibles) a partir de un valor
            inicial y una regla de variación entre períodos.
          </p>
          <div className="fila-form c4">
            <Campo etiqueta="Desagregación">
              <select
                value={autoDesagregacionEfectiva}
                onChange={(e) => setAutoDesagregacion(e.target.value)}
                data-testid="metas-auto-desagregacion"
              >
                {combinaciones.map((c) => {
                  const clave = claveATexto(c.clave);
                  return <option key={clave} value={clave}>{etiquetaCombinacion(c, listasPorId)}</option>;
                })}
              </select>
            </Campo>
            <Campo etiqueta="Valor inicial">
              <input
                type="number"
                value={autoValor}
                onChange={(e) => setAutoValor(e.target.value)}
                data-testid="metas-auto-valor"
              />
            </Campo>
            <Campo etiqueta="Período inicial">
              <select
                value={autoPeriodoInicialEfectivo}
                onChange={(e) => setAutoPeriodoInicialId(e.target.value)}
                data-testid="metas-auto-periodo-inicial"
              >
                {periodos.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Modo">
              <select
                value={autoModo}
                onChange={(e) => setAutoModo(e.target.value as ModoMetaAutomatica)}
                data-testid="metas-auto-modo"
              >
                {(Object.keys(ETIQUETAS_MODO_AUTO) as ModoMetaAutomatica[]).map((m) => (
                  <option key={m} value={m}>{ETIQUETAS_MODO_AUTO[m]}</option>
                ))}
              </select>
            </Campo>
          </div>
          {autoModo !== 'constante' && (
            <div className="fila-form c4">
              <Campo etiqueta={autoModo.endsWith('Porcentual') ? 'Porcentaje entre períodos (%)' : 'Cantidad entre períodos'}>
                <input
                  type="number"
                  value={autoIncremento}
                  onChange={(e) => setAutoIncremento(e.target.value)}
                  data-testid="metas-auto-incremento"
                />
              </Campo>
            </div>
          )}
          <button className="boton primario" style={{ marginTop: 8 }} onClick={aplicarMetasAutomaticas} data-testid="aplicar-metas-auto">
            Aplicar
          </button>
          {autoMensaje && (
            <div className="aviso info" style={{ marginTop: 8 }} data-testid="aviso-metas-auto">{autoMensaje}</div>
          )}
        </div>
      )}

      {!indicador ? (
        <Vacio icono="◎" mensaje="Seleccione un indicador" detalle="para configurar sus metas por período" />
      ) : errorPeriodos ? (
        <div className="aviso info">{errorPeriodos}</div>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla" data-testid="tabla-configuracion-metas">
            <thead>
              <tr>
                <th>Desagregación</th>
                <th style={{ textAlign: 'right', minWidth: 110 }}>Recurrente</th>
                {periodos.map((p) => <th key={p.id} style={{ textAlign: 'right', minWidth: 110 }}>{p.etiqueta}</th>)}
              </tr>
            </thead>
            <tbody>
              {combinaciones.map((combinacion, indiceFila) => {
                const clave = claveATexto(combinacion.clave);
                const recurrente = obtenerRecurrente(clave);
                return (
                  <tr key={clave}>
                    <td style={{ paddingLeft: 8 + combinacion.nivel * 16 }}>
                      {combinacion.nivel > 0 && <span className="conector-jerarquia">└</span>}
                      {etiquetaCombinacion(combinacion, listasPorId)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <CeldaMetaPeriodo
                        valorInicial={recurrente?.valor ?? null}
                        alConfirmar={(texto) => manejarCambioRecurrente(clave, texto)}
                        alPegar={(texto) => pegarColumnaRecurrente(indiceFila, texto)}
                        testId={`meta-recurrente-${clave}`}
                      />
                    </td>
                    {periodos.map((periodo, indiceCol) => {
                      const celda = obtenerCelda(clave, periodo.id);
                      return (
                        <td key={periodo.id} style={{ textAlign: 'right' }}>
                          <CeldaMetaPeriodo
                            valorInicial={celda?.valor ?? null}
                            placeholder={celda == null && recurrente ? String(recurrente.valor) : undefined}
                            alConfirmar={(texto) => manejarCambioCelda(clave, periodo, texto)}
                            alPegar={(texto) => pegarBloque(indiceFila, indiceCol, texto)}
                            testId={`meta-celda-${clave}-${periodo.id}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function corteVacio(): CorteMedicion {
  return { id: '', nombre: '', fecha: '', reglaGeneral: 'promedio', reglasPorIndicador: {}, creadoEn: '', actualizadoEn: '' };
}

/**
 * "Cortes de medición" (Batch Y, pedido explícito del usuario): momentos
 * globales de corte de datos para reportería, cada uno con una regla de
 * agregación general (promedio/promedio ponderado/máximo/mínimo) y
 * excepciones puntuales por indicador. Sección propia, independiente del
 * indicador elegido arriba (un corte agrega TODOS los indicadores visibles a
 * la vez) — por eso vive en su propio sub-componente con su propio estado.
 */
function SeccionCortesMedicion({ indicadores }: { indicadores: Indicador[] }): React.JSX.Element {
  const [cortes, setCortes] = useState<CorteMedicion[]>([]);
  const [editando, setEditando] = useState<CorteMedicion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verCalculo, setVerCalculo] = useState<CorteMedicion | null>(null);
  const [resultados, setResultados] = useState<ResultadoCorteMedicion[] | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setCortes(await trpcClient.cortesMedicion.listar.query());
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    setError(null);
    try {
      await trpcClient.cortesMedicion.guardar.mutate(editando);
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el corte de medición.');
    }
  };

  const eliminar = async (id: string): Promise<void> => {
    setError(null);
    try {
      await trpcClient.cortesMedicion.eliminar.mutate({ id });
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el corte de medición.');
    }
  };

  const calcular = async (corte: CorteMedicion): Promise<void> => {
    setVerCalculo(corte);
    setResultados(null);
    setResultados(await trpcClient.cortesMedicion.calcular.query({ id: corte.id }));
  };

  const establecerReglaIndicador = (indicadorId: string, regla: string): void => {
    if (!editando) return;
    const reglasPorIndicador = { ...editando.reglasPorIndicador };
    if (regla) reglasPorIndicador[indicadorId] = regla as TipoAgregacion;
    else delete reglasPorIndicador[indicadorId];
    setEditando({ ...editando, reglasPorIndicador });
  };

  return (
    <div className="tarjeta" data-testid="panel-cortes-medicion">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Cortes de medición</h3>
        <span className="texto-suave">Momentos globales de corte de datos para reportería</span>
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
              <th>Fecha de corte</th>
              <th>Regla general</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {cortes.map((c) => (
              <tr key={c.id} data-testid={`corte-medicion-${c.nombre}`}>
                <td style={{ cursor: 'pointer' }} onClick={() => setEditando(c)}>{c.nombre}</td>
                <td>{c.fecha}</td>
                <td>{ETIQUETAS_AGREGACION[c.reglaGeneral]}</td>
                <td>
                  <button className="boton" onClick={() => void calcular(c)} data-testid={`calcular-corte-${c.nombre}`}>Calcular</button>
                </td>
              </tr>
            ))}
            {cortes.length === 0 && (
              <tr><td colSpan={4}><Vacio mensaje="Sin cortes de medición" detalle="cree uno con “+ Corte”" /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {verCalculo && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ margin: '0 0 8px' }}>Resultado — {verCalculo.nombre} ({verCalculo.fecha})</h4>
          {resultados == null ? (
            <p className="texto-suave">Calculando…</p>
          ) : resultados.length === 0 ? (
            <Vacio mensaje="Sin indicadores con datos en la ventana de este corte" />
          ) : (
            <div className="tabla-envoltura">
              <table className="tabla" data-testid="tabla-resultado-corte">
                <thead>
                  <tr><th>Indicador</th><th>Regla aplicada</th><th style={{ textAlign: 'right' }}>Valor agregado</th><th style={{ textAlign: 'right' }}>Períodos</th></tr>
                </thead>
                <tbody>
                  {resultados.map((r) => (
                    <tr key={r.indicadorId}>
                      <td>{r.nombre}</td>
                      <td>{ETIQUETAS_AGREGACION[r.regla]}</td>
                      <td style={{ textAlign: 'right' }}>{r.valorAgregado ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>{r.periodosConsiderados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
          <Campo etiqueta="Fecha de corte" obligatorio>
            <input
              type="date"
              value={editando.fecha}
              onChange={(e) => setEditando({ ...editando, fecha: e.target.value })}
              data-testid="corte-fecha"
            />
          </Campo>
          <Campo etiqueta="Regla general">
            <select
              value={editando.reglaGeneral}
              onChange={(e) => setEditando({ ...editando, reglaGeneral: e.target.value as TipoAgregacion })}
              data-testid="corte-regla-general"
            >
              {OPCIONES_AGREGACION.map((op) => <option key={op} value={op}>{ETIQUETAS_AGREGACION[op]}</option>)}
            </select>
          </Campo>
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
                          {OPCIONES_AGREGACION.map((op) => <option key={op} value={op}>{ETIQUETAS_AGREGACION[op]}</option>)}
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
    </div>
  );
}

/** Celda editable de la grilla: estado local mientras se escribe, confirmación al salir o con Enter — mismo patrón que `CeldaValor` de Recolección. */
function CeldaMetaPeriodo({
  valorInicial, placeholder, alConfirmar, alPegar, testId
}: {
  valorInicial: number | null;
  placeholder?: string;
  alConfirmar: (texto: string) => void;
  alPegar: (texto: string) => void;
  testId: string;
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
      style={{ textAlign: 'right' }}
      value={texto}
      placeholder={placeholder}
      title={placeholder ? `Valor recurrente: ${placeholder} (sin override puntual para este período)` : undefined}
      data-testid={testId}
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
        if (e.key === 'Enter') {
          e.preventDefault();
          alConfirmar(texto);
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
          setTexto(valorInicial == null ? '' : String(valorInicial));
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
