import { useCallback, useEffect, useState } from 'react';
import type {
  Atributo, Categoria, DefinicionPeriodicidad, ElementoLista, Equipo, Indicador, Periodo,
  ReglaNegocio, ValorAtributo
} from '@domain/index';
import { GeneradorPeriodos, Periodicidad, construirContextoIndicador, etiquetaConPrefijo } from '@domain/index';
import type { ValorAtributoEntidad } from '@application/ports/index';
import { invocar } from '../../api';
import { trpcClient } from '../../trpc';
import { tipos, validadorAtributos } from '../../dominio';

/** Usuario asignable como responsable de un indicador (Batch U: unificado con el antiguo catálogo Responsable). */
type UsuarioAsignable = Awaited<ReturnType<typeof trpcClient.usuarios.listar.query>>[number];
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { CampoAtributo } from '../../componentes/CampoAtributo';
import { Icono } from '../../componentes/Icono';
import type { GrupoSelectorBuscable } from '../../componentes/SelectorBuscable';
import { SelectorBuscable } from '../../componentes/SelectorBuscable';
import { ordenarJerarquia } from '../../utils/jerarquia';
import { ImportarExcelIndicadores } from './ImportarExcelIndicadores';
import { ModalAutomatizacionIndicador } from './ModalAutomatizacionIndicador';

const generadorPeriodos = new GeneradorPeriodos();

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

/**
 * Configuración de Indicadores: atributos mínimos obligatorios, selección
 * de desagregaciones con checkboxes, periodicidad personalizada,
 * responsable/categoría, y atributos dinámicos con
 * visibilidad/obligatoriedad/validación en vivo (motor de reglas del
 * dominio, ejecutado en el propio renderer). Batch X (X11): la gestión de
 * Metas se sacó de este formulario — vive únicamente en el módulo Metas.
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
    const pendientes = idsAtributos.filter((id) => !elementosPorLista.has(id));
    if (pendientes.length === 0) return;
    void Promise.all(pendientes.map((id) => invocar('listas:elementos', { listaId: id }).then((els) => [id, els] as const))).then(
      (pares) => setElementosPorLista((previo) => new Map([...previo, ...pares]))
    );
  }, [atributos, elementosPorLista]);

  const abrirEditor = async (indicador: Indicador): Promise<void> => {
    setErrores([]);
    setMostrarAutomatizacion(false);
    setEditando(indicador);
    if (indicador.id) {
      const valores = await invocar('atributos:valores', { entidadTipo: 'Indicador', entidadId: indicador.id });
      const mapa = new Map<string, string>();
      for (const v of valores) {
        mapa.set(v.atributoId, v.valorTexto ?? (v.valorNumero != null ? String(v.valorNumero) : (v.valorFecha ?? (v.valorBooleano != null ? (v.valorBooleano ? 'Sí' : 'No') : ''))));
      }
      setValoresAttr(mapa);
    } else {
      setValoresAttr(new Map());
    }
  };

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    const valores = atributos
      .filter((a) => valoresAttr.has(a.id))
      .map((a) => construirValorEntidad(a, valoresAttr.get(a.id) ?? '', editando.id));
    try {
      await invocar('indicadores:guardar', { indicador: editando, valores });
      setEditando(null);
      await cargar();
    } catch (error) {
      const e = error as Error & { detalles?: string[] };
      setErrores(e.detalles?.length ? e.detalles : [e.message]);
    }
  };

  const filtrados = indicadores.filter((i) =>
    i.nombre.toLowerCase().includes(filtro.toLowerCase()) || i.codigo.toLowerCase().includes(filtro.toLowerCase())
  );
  const equiposPorId = new Map(equipos.map((e) => [e.id, e]));

  // Grupos/opciones para el buscador de "Responsable / Equipo" (Batch X, X12).
  const gruposResponsable: GrupoSelectorBuscable[] = [
    ...equipos.map((eq) => ({
      etiqueta: rutaEquipo(eq, equiposPorId),
      opciones: [
        { value: `equipo:${eq.id}`, etiqueta: '— Todo el equipo —' },
        ...responsables.filter((r) => r.equipoId === eq.id).map((r) => ({ value: `responsable:${r.id}`, etiqueta: r.nombreCompleto }))
      ]
    })),
    ...(responsables.some((r) => !r.equipoId)
      ? [{
          etiqueta: 'Sin equipo',
          opciones: responsables.filter((r) => !r.equipoId).map((r) => ({ value: `responsable:${r.id}`, etiqueta: r.nombreCompleto }))
        }]
      : [])
  ];

  /** Texto mostrado en el buscador para el vínculo actualmente elegido. */
  function etiquetaResponsableSeleccionado(ind: Pick<Indicador, 'equipo' | 'responsable'>): string {
    if (ind.equipo) return '— Todo el equipo —';
    if (ind.responsable) return responsables.find((r) => r.id === ind.responsable)?.nombreCompleto ?? '';
    return '';
  }

  // Grupos/opciones para el buscador de "Categoría" (Batch X, X12) — jerarquía
  // visual vía indentación por nivel, mismo criterio que ya usa AdminPage.
  const gruposCategoria: GrupoSelectorBuscable[] = [
    { etiqueta: null, opciones: ordenarJerarquia(categorias).map((c) => ({ value: c.id, etiqueta: c.nombre, nivel: c.nivel })) }
  ];

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
        descripcion="Definición de indicadores institucionales: periodicidad, línea base y desagregaciones."
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
              <th>Meta global</th>
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
              <SelectorBuscable
                grupos={gruposResponsable}
                valor={editando.equipo ? `equipo:${editando.equipo}` : editando.responsable ? `responsable:${editando.responsable}` : ''}
                etiquetaSeleccionada={etiquetaResponsableSeleccionado(editando)}
                placeholder="Buscar equipo o responsable…"
                alSeleccionar={(valor) => {
                  if (valor.startsWith('equipo:')) {
                    setEditando({ ...editando, equipo: valor.slice('equipo:'.length), responsable: null });
                  } else if (valor.startsWith('responsable:')) {
                    setEditando({ ...editando, responsable: valor.slice('responsable:'.length), equipo: null });
                  } else {
                    setEditando({ ...editando, equipo: equipoGeneralId(equipos), responsable: null });
                  }
                }}
                testId="indicador-responsable"
              />
              <span className="texto-suave">
                Elija un equipo completo (vínculo directo) o un responsable puntual (vínculo indirecto vía su equipo).
              </span>
            </Campo>
            <Campo etiqueta="Categoría" obligatorio>
              <SelectorBuscable
                grupos={gruposCategoria}
                valor={editando.categoria ?? categoriaGeneralId(categorias) ?? ''}
                etiquetaSeleccionada={
                  categorias.find((c) => c.id === (editando.categoria ?? categoriaGeneralId(categorias)))?.nombre ?? ''
                }
                placeholder="Buscar categoría…"
                alSeleccionar={(valor) => setEditando({ ...editando, categoria: valor || null })}
                testId="indicador-categoria"
              />
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
