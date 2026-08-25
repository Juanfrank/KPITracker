import { useEffect, useRef, useState } from 'react';
import type { DefinicionPeriodicidad, ElementoLista, Indicador, Meta, Periodo } from '@domain/index';
import { GeneradorPeriodos, Periodicidad, ProductoCartesiano, claveATexto } from '@domain/index';
import { invocar } from '../../api';
import { Campo, Encabezado, Vacio } from '../../componentes/basicos';

const generadorPeriodos = new GeneradorPeriodos();
const productoCartesiano = new ProductoCartesiano();
const PERIODICIDADES = Object.values(Periodicidad);
const METODOS_CALCULO: Meta['metodoCalculo'][] = ['Promedio', 'Sumatoria', 'UltimoValor', 'Maximo', 'Minimo'];

type Combinacion = ReturnType<typeof productoCartesiano.generar>[number];

function etiquetaCombinacion(combinacion: Combinacion, listasPorId: Map<string, { nombre: string }>): string {
  if (combinacion.etiquetas.length === 0) return 'General (total del indicador)';
  return combinacion.etiquetas.map((e) => `${listasPorId.get(e.listaId)?.nombre ?? e.listaId}: ${e.descripcion}`).join(' / ');
}

/**
 * Configuración de Metas: igual que Recolección elige un indicador y
 * muestra sus combinaciones de desagregación como filas, pero en vez de
 * capturar UN resultado a la vez, aquí se define el VALOR OBJETIVO de
 * cada período de la recurrencia elegida (mensual, trimestral...) — todos
 * a la vista en una sola grilla, con pegado estilo Excel. La primera
 * columna ("Recurrente", Batch X X11) edita el valor que aplica por
 * defecto a TODOS los períodos de esa periodicidad/año — antes solo se
 * podía definir desde la sección "Metas" del formulario de Indicadores,
 * retirada de ahí para que la gestión de metas viva únicamente en este
 * módulo. Un override puntual por período (columnas siguientes) tiene
 * prioridad sobre el recurrente (ver `metaVigenteParaPeriodo`); dejar la
 * celda vacía borra ese override puntual y el período vuelve a tomar el
 * valor recurrente (mostrado atenuado como referencia).
 */
export function ConfiguracionMetasPage(): React.JSX.Element {
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [indicadorId, setIndicadorId] = useState<string | null>(null);
  const [listas, setListas] = useState<{ id: string; nombre: string; estado: string }[]>([]);
  const [elementosPorLista, setElementosPorLista] = useState<Map<string, ElementoLista[]>>(new Map());
  const [periodicidades, setPeriodicidades] = useState<DefinicionPeriodicidad[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [periodicidad, setPeriodicidad] = useState<Periodicidad>(Periodicidad.Mensual);
  const [periodicidadPersonalizadaId, setPeriodicidadPersonalizadaId] = useState<string | null>(null);
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  const [metodoCalculo, setMetodoCalculo] = useState<Meta['metodoCalculo']>('Promedio');
  // Debounce por celda (misma disciplina que IndicadoresPage/ListasPage, Batch U8):
  // actualiza el estado local al instante, difiere la escritura de red.
  const temporizadores = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    void invocar('indicadores:listar', undefined).then((todos) => setIndicadores(todos.filter((i) => i.estado === 'Activo' && !i.esCalculado)));
    void invocar('listas:listar', undefined).then(setListas);
    void invocar('periodicidades:listar', undefined).then(setPeriodicidades);
    void invocar('config:obtener', undefined).then((c) => setAnio(c.anioInicial));
  }, []);

  const indicador = indicadores.find((i) => i.id === indicadorId) ?? null;

  const seleccionarIndicador = async (id: string): Promise<void> => {
    setIndicadorId(id || null);
    if (!id) {
      setMetas([]);
      return;
    }
    const encontrado = indicadores.find((i) => i.id === id);
    if (encontrado) {
      setPeriodicidad(encontrado.periodicidad);
      setPeriodicidadPersonalizadaId(encontrado.periodicidadPersonalizadaId);
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
      errorPeriodos = 'Seleccione una definición de periodicidad personalizada para ver sus períodos.';
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

  return (
    <>
      <Encabezado
        titulo="Configuración de Metas"
        descripcion='Defina el valor objetivo de cada período según la recurrencia elegida (mensual, trimestral, semestral, anual...). Un valor puntual por período tiene prioridad sobre el recurrente ya definido en "Metas" del indicador; déjelo vacío para volver a ese valor recurrente.'
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
          <Campo etiqueta="Periodicidad (recurrencia)">
            <select
              value={periodicidad}
              disabled={!indicador}
              onChange={(e) => {
                const nueva = e.target.value as Periodicidad;
                setPeriodicidad(nueva);
                if (nueva !== Periodicidad.Personalizada) setPeriodicidadPersonalizadaId(null);
              }}
              data-testid="configuracion-metas-periodicidad"
            >
              {PERIODICIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Año">
            <input
              type="number"
              value={anio}
              disabled={!indicador}
              onChange={(e) => setAnio(Number(e.target.value))}
              data-testid="configuracion-metas-anio"
            />
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
        {periodicidad === Periodicidad.Personalizada && indicador && (
          <Campo etiqueta="Definición de periodicidad personalizada">
            <select
              value={periodicidadPersonalizadaId ?? ''}
              onChange={(e) => setPeriodicidadPersonalizadaId(e.target.value || null)}
              data-testid="configuracion-metas-periodicidad-personalizada"
            >
              <option value="">— seleccionar —</option>
              {periodicidades.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </Campo>
        )}
      </div>

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
