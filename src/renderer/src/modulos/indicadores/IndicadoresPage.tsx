import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Atributo, Categoria, DefinicionPeriodicidad, ElementoLista, Equipo, Indicador, Meta, Periodo,
  ReglaNegocio, ValorAtributo
} from '@domain/index';
import {
  GeneradorPeriodos, Periodicidad, ProductoCartesiano, claveATexto, construirContextoIndicador, etiquetaConPrefijo
} from '@domain/index';
import type { ValorAtributoEntidad } from '@application/ports/index';
import { invocar } from '../../api';
import { trpcClient } from '../../trpc';
import { tipos, validadorAtributos } from '../../dominio';

/** Usuario asignable como responsable de un indicador (Batch U: unificado con el antiguo catálogo Responsable). */
type UsuarioAsignable = Awaited<ReturnType<typeof trpcClient.usuarios.listar.query>>[number];
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { CampoAtributo } from '../../componentes/CampoAtributo';
import { Icono } from '../../componentes/Icono';
import { ImportarExcelIndicadores } from './ImportarExcelIndicadores';
import { ModalAutomatizacionIndicador } from './ModalAutomatizacionIndicador';

const generadorPeriodos = new GeneradorPeriodos();
const productoCartesiano = new ProductoCartesiano();

interface OpcionDesagregacion {
  value: string;
  label: string;
}

/**
 * Opciones para el `<select>` de "Desagregación (clave)" de una Meta: la
 * misma cardinalidad que puede capturarse en Recolección (General + todas
 * las combinaciones/subtotales del cubo), con una etiqueta legible en vez
 * del texto técnico `<listaId>=<codigo>` que antes había que teclear a mano.
 */
function opcionesDesagregacion(
  desagregaciones: string[],
  listasPorId: Map<string, { nombre: string }>,
  elementosPorLista: Map<string, ElementoLista[]>
): OpcionDesagregacion[] {
  return productoCartesiano.generar(desagregaciones, elementosPorLista).map((combinacion) => ({
    value: claveATexto(combinacion.clave),
    label:
      combinacion.etiquetas.length === 0
        ? 'General (todo el indicador)'
        : combinacion.etiquetas.map((e) => `${listasPorId.get(e.listaId)?.nombre ?? e.listaId}: ${e.descripcion}`).join(', ') +
          (combinacion.nivel < desagregaciones.length ? ' (subtotal)' : '')
  }));
}

/** Empareja texto pegado desde Excel contra las opciones válidas de una columna, sin distinguir mayúsculas/minúsculas. */
function emparejarTexto<T extends string>(texto: string, opciones: readonly T[]): T | undefined {
  const normalizado = texto.trim().toLowerCase();
  return opciones.find((o) => o.toLowerCase() === normalizado);
}

/** Ruta completa "Equipo > Sub-equipo > ..." de un equipo, para etiquetar su `<optgroup>` (que no anida más de un nivel). */
function rutaEquipo(equipo: Equipo, porId: Map<string, Equipo>): string {
  const partes: string[] = [equipo.nombre];
  let actual = equipo.padreId ? porId.get(equipo.padreId) : undefined;
  while (actual) {
    partes.unshift(actual.nombre);
    actual = actual.padreId ? porId.get(actual.padreId) : undefined;
  }
  return partes.join(' > ');
}

/** Id de la categoría/equipo raíz "General" (Batch T) dentro de una lista ya cargada — respaldo obligatorio de un indicador sin clasificar. */
function categoriaGeneralId(categorias: Categoria[]): string | null {
  return categorias.find((c) => c.nombre === 'General' && c.padreId === null)?.id ?? null;
}
function equipoGeneralId(equipos: Equipo[]): string | null {
  return equipos.find((e) => e.nombre === 'General' && e.padreId === null)?.id ?? null;
}

function indicadorVacio(): Indicador {
  return {
    id: '',
    codigo: '',
    nombre: '',
    definicion: '',
    formaCalculo: null,
    periodicidad: Periodicidad.Mensual,
    periodicidadPersonalizadaId: null,
    lineaBase: null,
    lineaBasePeriodoId: null,
    metaGlobal: null,
    desagregaciones: [],
    estado: 'Activo',
    responsable: null,
    categoria: null,
    equipo: null,
    unidadMedida: null,
    esCalculado: false,
    formula: null,
    requiereValidacion: true,
    creadoEn: '',
    actualizadoEn: ''
  };
}

/** Convierte el valor crudo (texto de la UI) al valor tipado y a la columna EAV correcta, según el TypeRegistry. */
function construirValorEntidad(atributo: Atributo, crudo: string, entidadId: string): ValorAtributoEntidad {
  const descriptor = tipos.obtener(atributo.tipoDato);
  const parseado = descriptor.parse(crudo);
  const valor = parseado.ok ? parseado.valor : null;
  const base: ValorAtributoEntidad = {
    atributoId: atributo.id,
    entidadTipo: 'Indicador',
    entidadId,
    valorTexto: null,
    valorNumero: null,
    valorFecha: null,
    valorBooleano: null
  };
  switch (descriptor.columnaEav) {
    case 'numero':
      base.valorNumero = typeof valor === 'number' ? valor : null;
      break;
    case 'fecha':
      base.valorFecha = typeof valor === 'string' ? valor : null;
      break;
    case 'booleano':
      base.valorBooleano = typeof valor === 'boolean' ? valor : null;
      break;
    default:
      base.valorTexto = valor == null ? null : Array.isArray(valor) ? valor.join('; ') : String(valor);
  }
  return base;
}

const PERIODICIDADES_INDICADOR = Object.values(Periodicidad);
const PERIODICIDADES_META = Object.values(Periodicidad);
const METODOS_CALCULO: Meta['metodoCalculo'][] = ['Promedio', 'Sumatoria', 'UltimoValor', 'Maximo', 'Minimo'];

/**
 * Configuración de Indicadores: atributos mínimos obligatorios, selección
 * de desagregaciones con checkboxes, metas por desagregación, periodicidad
 * personalizada, responsable/categoría, y atributos dinámicos con
 * visibilidad/obligatoriedad/validación en vivo (motor de reglas del
 * dominio, ejecutado en el propio renderer).
 */
export function IndicadoresPage(): React.JSX.Element {
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [listas, setListas] = useState<{ id: string; nombre: string; estado: string }[]>([]);
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [reglas, setReglas] = useState<ReglaNegocio[]>([]);
  const [elementosPorLista, setElementosPorLista] = useState<Map<string, ElementoLista[]>>(new Map());
  const [periodicidades, setPeriodicidades] = useState<DefinicionPeriodicidad[]>([]);
  const [responsables, setResponsables] = useState<UsuarioAsignable[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [mostrarAutomatizacion, setMostrarAutomatizacion] = useState(false);
  const [editando, setEditando] = useState<Indicador | null>(null);
  const [valoresAttr, setValoresAttr] = useState<Map<string, string>>(new Map());
  const [metas, setMetas] = useState<Meta[]>([]);
  // Metas capturadas mientras el indicador todavía no existe (sin id) — no hay a qué "indicadorId"
  // persistirlas todavía, así que viven solo en el renderer hasta que `guardar()` resuelve el id real,
  // mismo patrón que `valoresAttr` para los atributos dinámicos.
  const [metasPendientes, setMetasPendientes] = useState<Meta[]>([]);
  // Debounce por meta (~500ms, Batch U8): agrupa el tecleo rápido sobre el
  // mismo campo (valor, año, clave de desagregación...) en una sola
  // escritura de red — sin esto, cada onChange generaba su propia fila de
  // auditoría.
  const temporizadoresGuardadoMeta = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [errores, setErrores] = useState<string[]>([]);
  const [filtro, setFiltro] = useState('');
  const [anioInicial, setAnioInicial] = useState<number>(new Date().getFullYear());
  const [mostrarImportar, setMostrarImportar] = useState(false);

  const cargar = useCallback(async (): Promise<void> => {
    setIndicadores(await invocar('indicadores:listar', undefined));
  }, []);

  useEffect(() => {
    void cargar();
    void invocar('listas:listar', undefined).then(setListas);
    void invocar('atributos:listar', { entidad: 'Indicador' }).then(setAtributos);
    void invocar('reglas:listar', { entidad: 'Indicador' }).then(setReglas);
    void invocar('periodicidades:listar', undefined).then(setPeriodicidades);
    void trpcClient.usuarios.listar.query().then(setResponsables);
    void invocar('categorias:listar', undefined).then(setCategorias);
    void invocar('equipos:listar', undefined).then(setEquipos);
    void invocar('config:obtener', undefined).then((c) => setAnioInicial(c.anioInicial));
  }, [cargar]);

  /** Períodos disponibles para el selector de línea base, calculados localmente (dominio puro). */
  const periodosLineaBase = (indicador: Indicador): Periodo[] => {
    if (indicador.periodicidad === Periodicidad.Personalizada) {
      const definicion = periodicidades.find((d) => d.id === indicador.periodicidadPersonalizadaId);
      if (!definicion) return [];
      return generadorPeriodos.periodosDisponibles(anioInicial, indicador.periodicidad, new Date().toISOString().slice(0, 10), definicion);
    }
    return generadorPeriodos.periodosDisponibles(anioInicial, indicador.periodicidad, new Date().toISOString().slice(0, 10));
  };

  useEffect(() => {
    const idsAtributos = atributos.filter((a) => a.listaId).map((a) => a.listaId as string);
    // También se necesitan los elementos de las propias desagregaciones del
    // indicador en edición, para poder listarlas por nombre en el selector
    // de "Desagregación (clave)" de la grilla de Metas.
    const idsDesagregaciones = editando?.desagregaciones ?? [];
    const idsListas = [...new Set([...idsAtributos, ...idsDesagregaciones])];
    const pendientes = idsListas.filter((id) => !elementosPorLista.has(id));
    if (pendientes.length === 0) return;
    void Promise.all(pendientes.map((id) => invocar('listas:elementos', { listaId: id }).then((els) => [id, els] as const))).then(
      (pares) => setElementosPorLista((previo) => new Map([...previo, ...pares]))
    );
  }, [atributos, elementosPorLista, editando?.desagregaciones]);

  const abrirEditor = async (indicador: Indicador): Promise<void> => {
    setErrores([]);
    setMostrarAutomatizacion(false);
    setEditando(indicador);
    if (indicador.id) {
      const [valores, metasIndicador] = await Promise.all([
        invocar('atributos:valores', { entidadTipo: 'Indicador', entidadId: indicador.id }),
        invocar('metas:listar', { indicadorId: indicador.id })
      ]);
      const mapa = new Map<string, string>();
      for (const v of valores) {
        mapa.set(v.atributoId, v.valorTexto ?? (v.valorNumero != null ? String(v.valorNumero) : (v.valorFecha ?? (v.valorBooleano != null ? (v.valorBooleano ? 'Sí' : 'No') : ''))));
      }
      setValoresAttr(mapa);
      setMetas(metasIndicador);
      setMetasPendientes([]);
    } else {
      setValoresAttr(new Map());
      setMetas([]);
      setMetasPendientes([]);
    }
  };

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    const esNuevo = !editando.id;
    const valores = atributos
      .filter((a) => valoresAttr.has(a.id))
      .map((a) => construirValorEntidad(a, valoresAttr.get(a.id) ?? '', editando.id));
    try {
      const guardado = await invocar('indicadores:guardar', { indicador: editando, valores });
      if (esNuevo && metasPendientes.length > 0) {
        // Recién ahora existe un indicadorId real: se persisten las metas capturadas
        // localmente durante la creación, una por una, igual que si se hubieran
        // agregado tras guardar y reabrir el indicador para editarlo.
        for (const m of metasPendientes) {
          await invocar('metas:guardar', { ...m, indicadorId: guardado.id });
        }
      }
      setEditando(null);
      setMetasPendientes([]);
      await cargar();
    } catch (error) {
      const e = error as Error & { detalles?: string[] };
      setErrores(e.detalles?.length ? e.detalles : [e.message]);
    }
  };

  function metaVacia(indicador: Indicador): Meta {
    return {
      id: crypto.randomUUID(),
      indicadorId: indicador.id,
      claveDesagregacion: 'GENERAL',
      valor: indicador.metaGlobal ?? 0,
      periodicidadMedicion: indicador.periodicidad,
      periodicidadPersonalizadaId: indicador.periodicidad === Periodicidad.Personalizada ? indicador.periodicidadPersonalizadaId : null,
      metodoCalculo: 'Promedio',
      anioVigencia: new Date().getFullYear(),
      // Recurrente por defecto (aplica a todos los períodos de su periodicidad
      // en el año): un valor específico por período puntual se define en
      // "Configuración de Metas", no acá.
      periodoId: null,
      creadoEn: '',
      actualizadoEn: ''
    };
  }

  /**
   * Crea una meta con valores específicos (usado tanto por "+ Meta", que no
   * pasa overrides, como por el pegado desde Excel, que sí). Sigue el mismo
   * criterio que el resto del formulario: si el indicador todavía no existe,
   * la meta queda en `metasPendientes` hasta que `guardar()` resuelva un id
   * real; si ya existe, se persiste de inmediato.
   */
  const crearMetaConValores = async (indicador: Indicador, overrides: Partial<Meta>): Promise<Meta> => {
    const base = { ...metaVacia(indicador), ...overrides };
    if (!indicador.id) {
      setMetasPendientes((previas) => [...previas, base]);
      return base;
    }
    const nueva = await invocar('metas:guardar', { ...base, id: '' });
    setMetas((previas) => [...previas, nueva]);
    return nueva;
  };

  const agregarMeta = async (): Promise<void> => {
    if (!editando) return;
    await crearMetaConValores(editando, {});
  };

  /**
   * Pegado masivo estilo Excel sobre la grilla de Metas: cada línea son 5
   * columnas [Valor, Año, Periodicidad, Desagregación, Método] separadas por
   * tabulador. Periodicidad/Método/Desagregación se emparejan contra las
   * opciones válidas (por valor técnico o por etiqueta), sin distinguir
   * mayúsculas — una columna que no matchea ninguna opción simplemente se
   * ignora y la fila conserva su valor/default previo. Actualiza filas
   * existentes a partir de `indiceInicio` y crea metas nuevas para las
   * líneas que excedan las ya existentes, igual que `pegarElementos` en
   * Listas.
   */
  const pegarMetas = async (indiceInicio: number, textoPortapapeles: string): Promise<void> => {
    if (!editando) return;
    const listasPorId = new Map(listas.map((l) => [l.id, l]));
    const opciones = opcionesDesagregacion(editando.desagregaciones, listasPorId, elementosPorLista);
    const filas = textoPortapapeles.replace(/\r/g, '').split('\n').filter((linea) => linea.trim() !== '');
    const actuales = editando.id ? metas : metasPendientes;
    const actualizadas = [...actuales];

    for (let i = 0; i < filas.length; i++) {
      const [valorTxt, anioTxt, periodicidadTxt, desagregacionTxt, metodoTxt] = (filas[i] ?? '').split('\t');
      const indice = indiceInicio + i;
      const existente = actualizadas[indice];

      const periodicidad = periodicidadTxt ? emparejarTexto(periodicidadTxt, PERIODICIDADES_META) : undefined;
      const metodo = metodoTxt ? emparejarTexto(metodoTxt, METODOS_CALCULO) : undefined;
      const desagregacionNormalizada = desagregacionTxt?.trim().toLowerCase();
      const opcionDesagregacion = desagregacionNormalizada
        ? opciones.find((o) => o.value.toLowerCase() === desagregacionNormalizada || o.label.toLowerCase() === desagregacionNormalizada)
        : undefined;

      const cambios: Partial<Meta> = {};
      if (valorTxt?.trim()) cambios.valor = Number(valorTxt) || 0;
      if (anioTxt?.trim()) cambios.anioVigencia = Number(anioTxt) || new Date().getFullYear();
      if (periodicidad) {
        cambios.periodicidadMedicion = periodicidad;
        if (periodicidad !== Periodicidad.Personalizada) cambios.periodicidadPersonalizadaId = null;
      }
      if (opcionDesagregacion) cambios.claveDesagregacion = opcionDesagregacion.value;
      if (metodo) cambios.metodoCalculo = metodo;

      if (existente) {
        const actualizado = { ...existente, ...cambios };
        actualizadas[indice] = actualizado;
        actualizarMeta(actualizado);
      } else {
        actualizadas.push(await crearMetaConValores(editando, cambios));
      }
    }
  };

  const actualizarMeta = (meta: Meta): void => {
    if (!editando?.id) {
      setMetasPendientes((previas) => previas.map((m) => (m.id === meta.id ? meta : m)));
      return;
    }
    // Actualización optimista instantánea; la escritura de red se debounce
    // para no generar una fila de auditoría por tecla.
    setMetas((previas) => previas.map((m) => (m.id === meta.id ? meta : m)));
    const temporizadores = temporizadoresGuardadoMeta.current;
    const anterior = temporizadores.get(meta.id);
    if (anterior) clearTimeout(anterior);
    temporizadores.set(
      meta.id,
      setTimeout(() => {
        temporizadores.delete(meta.id);
        void invocar('metas:guardar', meta);
      }, 500)
    );
  };

  const eliminarMeta = (meta: Meta): void => {
    if (!editando?.id) {
      setMetasPendientes((previas) => previas.filter((m) => m.id !== meta.id));
      return;
    }
    // Cancela cualquier guardado debounced pendiente de esta meta: no tiene
    // sentido escribirla de vuelta tras eliminarla.
    const temporizador = temporizadoresGuardadoMeta.current.get(meta.id);
    if (temporizador) {
      clearTimeout(temporizador);
      temporizadoresGuardadoMeta.current.delete(meta.id);
    }
    void invocar('metas:eliminar', { id: meta.id }).then(() => setMetas((prev) => prev.filter((x) => x.id !== meta.id)));
  };

  const filtrados = indicadores.filter((i) =>
    i.nombre.toLowerCase().includes(filtro.toLowerCase()) || i.codigo.toLowerCase().includes(filtro.toLowerCase())
  );
  const equiposPorId = new Map(equipos.map((e) => [e.id, e]));

  // Validación en vivo de atributos dinámicos: mismas reglas que evaluará el backend al guardar.
  const base = editando ?? indicadorVacio();
  const valoresMap = new Map<string, ValorAtributo>(
    atributos.map((a) => {
      const parseado = tipos.obtener(a.tipoDato).parse(valoresAttr.get(a.id) ?? '');
      return [a.id, parseado.ok ? parseado.valor : null] as const;
    })
  );
  const contexto = construirContextoIndicador(base, atributos, valoresMap);
  const erroresAtributo = new Map(
    validadorAtributos.validar(atributos, valoresMap, contexto, reglas).map((r) => [r.atributoId, r.errores[0]?.mensaje ?? 'Valor inválido.'])
  );
  const atributosVisibles = atributos.filter((a) => a.activo && validadorAtributos.esVisible(a, contexto, reglas));

  return (
    <>
      <Encabezado
        titulo="Configuración de Indicadores"
        descripcion="Definición de indicadores institucionales: periodicidad, línea base, metas y desagregaciones."
        acciones={
          <>
            <button className="boton" onClick={() => setMostrarImportar(true)} data-testid="importar-excel">
              <Icono nombre="subir" tamano={14} /> Importar desde Excel
            </button>
            <button
              className="boton primario"
              onClick={() => void abrirEditor({
                ...indicadorVacio(),
                categoria: categoriaGeneralId(categorias),
                equipo: equipoGeneralId(equipos)
              })}
              data-testid="nuevo-indicador"
            >
              <Icono nombre="mas" /> Nuevo indicador
            </button>
          </>
        }
      />
      {mostrarImportar && (
        <ImportarExcelIndicadores
          alCerrar={() => setMostrarImportar(false)}
          alTerminar={() => {
            setMostrarImportar(false);
            void cargar();
          }}
        />
      )}
      <div className="toolbar">
        <input type="search" placeholder="Filtrar indicadores…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
      </div>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Periodicidad</th>
              <th>Línea base</th>
              <th>Meta</th>
              <th>Desagregaciones</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((i) => (
              <tr key={i.id} onClick={() => void abrirEditor(i)} style={{ cursor: 'pointer' }} data-testid={`indicador-${i.nombre}`}>
                <td className="texto-suave">
                  {etiquetaConPrefijo(categorias.find((c) => c.id === i.categoria)?.prefijo, i.codigo) || '—'}
                </td>
                <td><strong>{i.nombre}</strong>{i.esCalculado && <span className="chip" style={{ marginLeft: 6 }}>Calculado</span>}</td>
                <td>{i.periodicidad}</td>
                <td>{i.lineaBase ?? '—'}</td>
                <td>{i.metaGlobal ?? '—'}</td>
                <td className="texto-suave">
                  {i.desagregaciones.length > 0
                    ? i.desagregaciones.map((d) => listas.find((l) => l.id === d)?.nombre ?? d).join(', ')
                    : 'Ninguna'}
                </td>
                <td>
                  <span className={`chip ${i.estado === 'Activo' ? 'completo' : 'noaplica'}`}>{i.estado}</span>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <Vacio icono="◫" mensaje="Sin indicadores" detalle="Cree el primer indicador para comenzar." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editando && (
        <PanelLateral
          titulo={editando.id ? 'Editar indicador' : 'Nuevo indicador'}
          alCerrar={() => setEditando(null)}
          pie={
            <>
              {editando.id && (
                <button
                  className="boton peligro"
                  onClick={() => {
                    void invocar('indicadores:eliminar', { id: editando.id }).then(() => {
                      setEditando(null);
                      void cargar();
                    });
                  }}
                >
                  Eliminar
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => setEditando(null)} data-testid="cancelar-indicador">Cancelar</button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-indicador">Guardar</button>
            </>
          }
        >
          {errores.length > 0 && (
            <div className="aviso error">
              {errores.map((e) => <div key={e}>{e}</div>)}
            </div>
          )}
          <div className="fila-form c2">
            <Campo etiqueta="Código">
              <input
                type="text"
                value={editando.codigo}
                placeholder="IND-001 (opcional, único)"
                onChange={(e) => setEditando({ ...editando, codigo: e.target.value })}
                data-testid="indicador-codigo"
              />
            </Campo>
            <Campo etiqueta="Nombre del indicador" obligatorio>
              <input type="text" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} data-testid="indicador-nombre" autoFocus />
            </Campo>
          </div>
          <Campo etiqueta="Definición" obligatorio>
            <textarea rows={3} value={editando.definicion} onChange={(e) => setEditando({ ...editando, definicion: e.target.value })} data-testid="indicador-definicion" />
          </Campo>
          <Campo etiqueta="Forma de cálculo">
            <textarea
              rows={3}
              value={editando.formaCalculo ?? ''}
              placeholder="Ej.: (Casos resueltos / Casos totales) * 100. También se acepta texto sin notación matemática."
              onChange={(e) => setEditando({ ...editando, formaCalculo: e.target.value || null })}
              data-testid="indicador-forma-calculo"
            />
            <span className="texto-suave">
              Opcional. Si incluye notación matemática, los signos de agrupación deben abrir y cerrar correctamente.
            </span>
          </Campo>
          <div className="fila-form c2">
            <Campo etiqueta="Periodicidad" obligatorio>
              <select
                value={editando.periodicidad}
                onChange={(e) => {
                  const periodicidad = e.target.value as Periodicidad;
                  setEditando({
                    ...editando,
                    periodicidad,
                    periodicidadPersonalizadaId: periodicidad === Periodicidad.Personalizada ? editando.periodicidadPersonalizadaId : null
                  });
                }}
                data-testid="indicador-periodicidad"
              >
                {PERIODICIDADES_INDICADOR.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Estado">
              <select value={editando.estado} onChange={(e) => setEditando({ ...editando, estado: e.target.value as Indicador['estado'] })}>
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
                <option value="Borrador">Borrador</option>
              </select>
            </Campo>
          </div>
          {editando.periodicidad === Periodicidad.Personalizada && (
            <Campo etiqueta="Definición de periodicidad personalizada" obligatorio>
              <select
                value={editando.periodicidadPersonalizadaId ?? ''}
                onChange={(e) => setEditando({ ...editando, periodicidadPersonalizadaId: e.target.value || null })}
                data-testid="indicador-periodicidad-personalizada"
              >
                <option value="">— seleccionar —</option>
                {periodicidades.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
              {periodicidades.length === 0 && (
                <span className="texto-suave">No hay definiciones; créelas en Configuración General.</span>
              )}
            </Campo>
          )}
          <div className="fila-form c3">
            <Campo etiqueta="Línea base">
              <input
                type="number"
                value={editando.lineaBase ?? ''}
                onChange={(e) => setEditando({ ...editando, lineaBase: e.target.value === '' ? null : Number(e.target.value) })}
                data-testid="indicador-linea-base"
              />
            </Campo>
            <Campo etiqueta="Meta global">
              <input
                type="number"
                value={editando.metaGlobal ?? ''}
                onChange={(e) => setEditando({ ...editando, metaGlobal: e.target.value === '' ? null : Number(e.target.value) })}
                data-testid="indicador-meta"
              />
            </Campo>
            <Campo etiqueta="Unidad de medida">
              <input type="text" value={editando.unidadMedida ?? ''} placeholder="%, casos…" onChange={(e) => setEditando({ ...editando, unidadMedida: e.target.value || null })} />
            </Campo>
          </div>
          {editando.lineaBase != null && (
            <Campo etiqueta="Período de la línea base">
              <select
                value={editando.lineaBasePeriodoId ?? ''}
                onChange={(e) => setEditando({ ...editando, lineaBasePeriodoId: e.target.value || null })}
                data-testid="indicador-linea-base-periodo"
              >
                <option value="">— sin especificar —</option>
                {periodosLineaBase(editando).map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
              </select>
              <span className="texto-suave">A qué período corresponde el valor de línea base registrado.</span>
            </Campo>
          )}
          <div className="fila-form c2">
            <Campo etiqueta="Responsable / Equipo" obligatorio>
              <select
                value={editando.equipo ? `equipo:${editando.equipo}` : editando.responsable ? `responsable:${editando.responsable}` : ''}
                onChange={(e) => {
                  const valor = e.target.value;
                  if (valor.startsWith('equipo:')) {
                    setEditando({ ...editando, equipo: valor.slice('equipo:'.length), responsable: null });
                  } else if (valor.startsWith('responsable:')) {
                    setEditando({ ...editando, responsable: valor.slice('responsable:'.length), equipo: null });
                  } else {
                    setEditando({ ...editando, equipo: equipoGeneralId(equipos), responsable: null });
                  }
                }}
                data-testid="indicador-responsable"
              >
                {equipos.map((eq) => (
                  <optgroup key={eq.id} label={rutaEquipo(eq, equiposPorId)}>
                    <option value={`equipo:${eq.id}`}>— Todo el equipo —</option>
                    {responsables.filter((r) => r.equipoId === eq.id).map((r) => (
                      <option key={r.id} value={`responsable:${r.id}`}>{r.nombreCompleto}</option>
                    ))}
                  </optgroup>
                ))}
                {responsables.some((r) => !r.equipoId) && (
                  <optgroup label="Sin equipo">
                    {responsables.filter((r) => !r.equipoId).map((r) => (
                      <option key={r.id} value={`responsable:${r.id}`}>{r.nombreCompleto}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <span className="texto-suave">
                Elija un equipo completo (vínculo directo) o un responsable puntual (vínculo indirecto vía su equipo).
              </span>
            </Campo>
            <Campo etiqueta="Categoría" obligatorio>
              <select
                value={editando.categoria ?? categoriaGeneralId(categorias) ?? ''}
                onChange={(e) => setEditando({ ...editando, categoria: e.target.value || null })}
                data-testid="indicador-categoria"
              >
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Campo>
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginTop: 8 }}>
            <input
              type="checkbox"
              checked={editando.esCalculado}
              onChange={(e) => setEditando({ ...editando, esCalculado: e.target.checked })}
              style={{ width: 'auto' }}
              data-testid="indicador-es-calculado"
            />
            Indicador calculado (su valor se obtiene de una fórmula, no se captura manualmente)
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginTop: 8 }}>
            <input
              type="checkbox"
              checked={editando.requiereValidacion}
              onChange={(e) => setEditando({ ...editando, requiereValidacion: e.target.checked })}
              style={{ width: 'auto' }}
              data-testid="indicador-requiere-validacion"
            />
            Requiere validación (sus resultados pasan por el flujo de aprobación en Recolección)
          </label>

          {editando.esCalculado && (
            <Campo etiqueta="Fórmula" obligatorio>
              <input
                type="text"
                value={editando.formula ?? ''}
                placeholder="[IND-001] + [IND-002] * 0.5"
                onChange={(e) => setEditando({ ...editando, formula: e.target.value })}
                data-testid="indicador-formula"
              />
              <span className="texto-suave">
                Expresión aritmética (+ − × ÷, paréntesis) que referencia el código de otros indicadores entre corchetes.
              </span>
            </Campo>
          )}

          {!editando.esCalculado && (
            <Campo etiqueta="Obtención automática de resultados">
              <button
                className="boton"
                disabled={!editando.id}
                onClick={() => setMostrarAutomatizacion(true)}
                data-testid="abrir-automatizacion"
              >
                Configurar obtención automática…
              </button>
              <span className="texto-suave">
                {editando.id
                  ? 'Origen, parámetros y mapeo de columnas a desagregaciones. Habilita el botón "Obtener automáticamente" en Recolección.'
                  : 'Guarde el indicador primero para poder configurar su obtención automática.'}
              </span>
            </Campo>
          )}

          <h4 style={{ margin: '8px 0 0' }}>Desagregaciones</h4>
          <p className="texto-suave" style={{ margin: 0 }}>
            Si selecciona varias, la captura generará todas las combinaciones (producto cartesiano) más una fila para el resultado General.
          </p>
          {listas.filter((l) => l.estado === 'Activa').map((l) => (
            <label key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editando.desagregaciones.includes(l.id)}
                onChange={(e) =>
                  setEditando({
                    ...editando,
                    desagregaciones: e.target.checked
                      ? [...editando.desagregaciones, l.id]
                      : editando.desagregaciones.filter((d) => d !== l.id)
                  })
                }
                style={{ width: 'auto' }}
                data-testid={`desagregacion-${l.nombre}`}
              />
              {l.nombre}
            </label>
          ))}
          {listas.length === 0 && <p className="texto-suave">No hay listas de selección; créelas en el módulo Listas.</p>}

          {atributosVisibles.length > 0 && (
            <>
              <h4 style={{ margin: '8px 0 0' }}>Atributos adicionales</h4>
              {atributosVisibles.map((a) => (
                <CampoAtributo
                  key={a.id}
                  atributo={a}
                  valor={valoresAttr.get(a.id) ?? a.valorPorDefecto ?? ''}
                  obligatorio={validadorAtributos.esObligatorio(a, contexto, reglas)}
                  error={erroresAtributo.get(a.id)}
                  opciones={a.listaId ? elementosPorLista.get(a.listaId) : undefined}
                  onChange={(crudo) => setValoresAttr(new Map(valoresAttr).set(a.id, crudo))}
                />
              ))}
            </>
          )}

          <>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <h4 style={{ margin: 0 }}>Metas</h4>
              <div className="separador" />
              <button className="boton" onClick={() => void agregarMeta()} data-testid="agregar-meta">
                <Icono nombre="mas" tamano={14} /> Meta
              </button>
            </div>
            {!editando.id && (
              <p className="texto-suave" style={{ margin: 0 }}>
                Se guardarán junto con el indicador al hacer clic en "Guardar".
              </p>
            )}
            <p className="texto-suave" style={{ margin: 0 }}>
              Se comporta como una hoja de cálculo: puede pegar filas copiadas de Excel (columnas Valor, Año, Periodicidad, Desagregación, Método) en
              cualquier celda de "Valor"; se crean metas nuevas si exceden las ya existentes.
            </p>
            {/* `flexShrink: 0`: dentro del cuerpo flex-column de PanelLateral, un hijo con
                `overflow: auto` (como esta envoltura) puede recibir un `min-height` implícito
                de 0 y quedar aplastado por el flexbox en vez de conservar su alto natural —
                dejando filas de la tabla renderizadas pero visualmente recortadas/no
                clicables. El scroll vertical real lo sigue dando el propio `.cuerpo`. */}
            <div className="tabla-envoltura" style={{ flexShrink: 0 }}>
              <table className="tabla tabla-metas" data-testid="tabla-metas">
                <thead>
                  <tr>
                    <th style={{ width: 68 }}>Valor</th>
                    <th style={{ width: 74 }}>Año</th>
                    <th style={{ width: 116 }}>Periodicidad</th>
                    <th>Desagregación</th>
                    <th style={{ width: 88 }}>Método</th>
                    <th style={{ width: 38 }} />
                  </tr>
                </thead>
                <tbody>
                  {(editando.id ? metas : metasPendientes).map((m, indice) => {
                    const opciones = opcionesDesagregacion(
                      editando.desagregaciones,
                      new Map(listas.map((l) => [l.id, l])),
                      elementosPorLista
                    );
                    return (
                      <tr key={m.id}>
                        <td>
                          <input
                            type="number"
                            value={m.valor}
                            onChange={(e) => void actualizarMeta({ ...m, valor: Number(e.target.value) })}
                            onPaste={(e) => {
                              const contenido = e.clipboardData.getData('text');
                              if (contenido.includes('\n') || contenido.includes('\t')) {
                                e.preventDefault();
                                void pegarMetas(indice, contenido);
                              }
                            }}
                            data-testid={`meta-valor-${indice}`}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={m.anioVigencia}
                            onChange={(e) => void actualizarMeta({ ...m, anioVigencia: Number(e.target.value) })}
                            data-testid={`meta-anio-${indice}`}
                          />
                        </td>
                        <td>
                          <select
                            value={m.periodicidadMedicion}
                            onChange={(e) => {
                              const periodicidadMedicion = e.target.value as Periodicidad;
                              void actualizarMeta({
                                ...m,
                                periodicidadMedicion,
                                periodicidadPersonalizadaId: periodicidadMedicion === Periodicidad.Personalizada ? m.periodicidadPersonalizadaId : null
                              });
                            }}
                            data-testid={`meta-periodicidad-${indice}`}
                          >
                            {PERIODICIDADES_META.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                          {m.periodicidadMedicion === Periodicidad.Personalizada && (
                            <select
                              value={m.periodicidadPersonalizadaId ?? ''}
                              onChange={(e) => void actualizarMeta({ ...m, periodicidadPersonalizadaId: e.target.value || null })}
                              style={{ marginTop: 4 }}
                              title="Definición de periodicidad personalizada"
                              data-testid={`meta-periodicidad-personalizada-${indice}`}
                            >
                              <option value="">— definición —</option>
                              {periodicidades.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                            </select>
                          )}
                        </td>
                        <td>
                          <select
                            value={m.claveDesagregacion}
                            onChange={(e) => void actualizarMeta({ ...m, claveDesagregacion: e.target.value })}
                            data-testid={`meta-desagregacion-${indice}`}
                          >
                            {opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td>
                          <select
                            value={m.metodoCalculo}
                            onChange={(e) => void actualizarMeta({ ...m, metodoCalculo: e.target.value as Meta['metodoCalculo'] })}
                            data-testid={`meta-metodo-${indice}`}
                          >
                            {METODOS_CALCULO.map((mc) => <option key={mc} value={mc}>{mc}</option>)}
                          </select>
                        </td>
                        <td>
                          <button
                            className="boton sutil"
                            title="Eliminar meta"
                            onClick={() => eliminarMeta(m)}
                            data-testid={`eliminar-meta-${indice}`}
                          >
                            <Icono nombre="cerrar" tamano={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {(editando.id ? metas : metasPendientes).length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <Vacio mensaje="Sin metas" detalle='Agregue una con "+ Meta" o pegue filas copiadas de Excel.' />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        </PanelLateral>
      )}

      {editando?.id && mostrarAutomatizacion && (
        <ModalAutomatizacionIndicador
          indicadorId={editando.id}
          indicadorNombre={editando.nombre}
          atributos={atributos}
          desagregaciones={editando.desagregaciones}
          listas={listas}
          alCerrar={() => setMostrarAutomatizacion(false)}
        />
      )}
    </>
  );
}
