import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Categoria, Equipo, FuenteParametroGeneral, Indicador, OrigenAutomatico, ParametroGeneral, Responsable, RolUsuario,
  TipoOrigenAutomatico
} from '@domain/index';
import { ejemploParaFuente, sinCiclo } from '@domain/index';
import type { ResultadoPruebaCodigo } from '@shared/ipc';
import { invocar } from '../../api';
import { descargar, postTexto } from '../../rest';
import { trpcClient } from '../../trpc';
import { useAuth } from '../../auth/AuthContext';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';
import { TarjetaRespaldo } from './TarjetaRespaldo';

function responsableVacio(): Responsable {
  return {
    id: '', nombre: '', correo: null, activo: true, eliminado: false, equipoId: null, creadoEn: '', actualizadoEn: ''
  };
}

function categoriaVacia(): Categoria {
  return {
    id: '', nombre: '', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null,
    creadoEn: '', actualizadoEn: ''
  };
}

function equipoVacio(): Equipo {
  return {
    id: '', nombre: '', descripcion: '', activo: true, eliminado: false, padreId: null, creadoEn: '', actualizadoEn: ''
  };
}

/**
 * Aplana un catálogo con `padreId` en orden jerárquico (DFS pre-order,
 * alfabético dentro de cada nivel) para mostrarlo indentado en una tabla o
 * un `<select>`. Un `padreId` que apunta a un id ausente de `items` (p. ej.
 * el padre está eliminado y oculto) se trata como raíz, para no perder la
 * fila de la lista.
 */
function ordenarJerarquia<T extends { id: string; padreId: string | null; nombre: string }>(
  items: readonly T[]
): Array<T & { nivel: number }> {
  const ids = new Set(items.map((i) => i.id));
  const porPadre = new Map<string | null, T[]>();
  for (const item of items) {
    const clave = item.padreId && ids.has(item.padreId) ? item.padreId : null;
    const lista = porPadre.get(clave) ?? [];
    lista.push(item);
    porPadre.set(clave, lista);
  }
  for (const lista of porPadre.values()) lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
  const resultado: Array<T & { nivel: number }> = [];
  const visitar = (padreId: string | null, nivel: number): void => {
    for (const item of porPadre.get(padreId) ?? []) {
      resultado.push({ ...item, nivel });
      visitar(item.id, nivel + 1);
    }
  };
  visitar(null, 0);
  return resultado;
}

function origenVacio(): OrigenAutomatico {
  return {
    id: '', nombre: '', tipo: 'API', descripcion: '', configuracion: {},
    parametrosGenerales: parametrosGeneralesPorDefecto(),
    activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
  };
}

/**
 * Autenticación "efectiva" cuando `configuracion.autenticacion` no está
 * explícitamente guardado: XMLA cae a Basic (SSAS on-premise clásico, su
 * comportamiento histórico), PowerBI cae a Microsoft (la API REST nunca
 * admite Basic, así que "sin configurar" no puede significar eso). Única
 * fuente de verdad para el valor mostrado en el selector, el aviso de
 * Client ID y los campos renderizados — antes divergían entre sí (el
 * selector mostraba "Microsoft" por un fallback propio mientras los campos
 * de abajo, sin ese mismo fallback, seguían mostrando Usuario/Contraseña),
 * lo que dejaba un origen PowerBI recién creado autenticándose "sin nada" en
 * tiempo real aunque la UI pareciera decir lo contrario.
 */
function autenticacionEfectiva(origen: OrigenAutomatico): string {
  return origen.configuracion.autenticacion || (origen.tipo === 'XMLA' ? 'basic' : 'microsoft');
}

type CampoConfig = { clave: string; etiqueta: string; sensible?: boolean };

/** Campos de configuración específicos por tipo de origen (clave dentro de `configuracion`, con máscara para credenciales). */
const CAMPOS_POR_TIPO: Record<TipoOrigenAutomatico, CampoConfig[]> = {
  XMLA: [
    { clave: 'servidor', etiqueta: 'URL del servidor XMLA (SSAS on-premise, https://.../msmdpump.dll)' },
    { clave: 'catalogo', etiqueta: 'Catálogo / cubo' }
  ],
  SQL: [
    { clave: 'servidor', etiqueta: 'Servidor (host[,puerto])' },
    { clave: 'puerto', etiqueta: 'Puerto (opcional)' },
    { clave: 'baseDatos', etiqueta: 'Base de datos' },
    { clave: 'usuario', etiqueta: 'Usuario' },
    { clave: 'contrasena', etiqueta: 'Contraseña', sensible: true }
  ],
  API: [
    { clave: 'url', etiqueta: 'URL base del endpoint' },
    { clave: 'metodo', etiqueta: 'Método (GET/POST)' },
    { clave: 'token', etiqueta: 'Token / API Key', sensible: true }
  ],
  PowerBI: [
    { clave: 'datasetId', etiqueta: 'Dataset Id (GUID del semantic model)' },
    { clave: 'groupId', etiqueta: 'Workspace Id (GUID, opcional — vacío = "Mi área de trabajo")' },
    { clave: 'apiBase', etiqueta: 'API base (opcional; nubes soberanas: api.powerbigov.us, api.powerbi.de, api.powerbi.cn)' },
    { clave: 'daxTablaFecha', etiqueta: 'Tabla de fecha del modelo (para el generador de consultas DAX, p. ej. Fecha)' },
    { clave: 'daxColumnaFecha', etiqueta: 'Columna de fecha dentro de esa tabla (p. ej. Fecha)' }
  ]
};

/**
 * XMLA y PowerBI comparten dos de sus tres formas de autenticación (campo
 * `configuracion.autenticacion`): OAuth2 vía Client Credentials (app-
 * únicamente, para automatización desatendida) y Microsoft con inicio de
 * sesión interactivo (delegado: el usuario se autentica con su propia
 * cuenta al probar la conexión). Basic (usuario/contraseña) es exclusivo de
 * XMLA — la API REST de Power BI nunca lo admite, y Power BI Premium/Fabric
 * XMLA/Azure Analysis Services tampoco.
 */
const CAMPOS_XMLA_BASIC: CampoConfig[] = [
  { clave: 'usuario', etiqueta: 'Usuario' },
  { clave: 'contrasena', etiqueta: 'Contraseña', sensible: true }
];
const CAMPOS_OAUTH2: CampoConfig[] = [
  { clave: 'tokenUrl', etiqueta: 'URL del token (token endpoint)' },
  { clave: 'clienteId', etiqueta: 'Client ID' },
  { clave: 'clienteSecreto', etiqueta: 'Client Secret', sensible: true },
  { clave: 'scope', etiqueta: 'Scope (opcional, p. ej. .../.default)' }
];
const CAMPOS_MICROSOFT: CampoConfig[] = [
  { clave: 'clienteId', etiqueta: 'Client ID (recomendado: registre su propia app; ver ayuda abajo)' },
  { clave: 'tenantId', etiqueta: 'Tenant ID (opcional; "organizations" por defecto)' },
  { clave: 'scope', etiqueta: 'Scope (opcional; se infiere del servidor: Power BI o Azure Analysis Services)' },
  { clave: 'redirectUri', etiqueta: 'Redirect URI (opcional; use la misma que registró en Azure Portal)' }
];

const FUENTES_PARAMETRO_GENERAL: Array<{ valor: FuenteParametroGeneral; etiqueta: string }> = [
  { valor: 'PeriodoId', etiqueta: 'Id del período' },
  { valor: 'PeriodoEtiqueta', etiqueta: 'Etiqueta del período' },
  { valor: 'FechaInicio', etiqueta: 'Fecha de inicio del período' },
  { valor: 'FechaFin', etiqueta: 'Fecha de fin del período' },
  { valor: 'Anio', etiqueta: 'Año' },
  { valor: 'MesNumero', etiqueta: 'Mes (numérico, del inicio del período)' },
  { valor: 'MesNombre', etiqueta: 'Mes (texto, del inicio del período)' },
  { valor: 'MesesNumeroLista', etiqueta: 'Lista de meses cubiertos (numérica, separada por comas)' },
  { valor: 'MesesNombreLista', etiqueta: 'Lista de meses cubiertos (texto, separada por comas)' },
  { valor: 'Numero', etiqueta: 'Número ordinal del período en el año' },
  { valor: 'Periodicidad', etiqueta: 'Periodicidad' }
];

/** Mismas fuentes, con un ejemplo calculado (período de muestra fijo) para orientar al usuario en el selector. */
const OPCIONES_FUENTE: Array<{ valor: FuenteParametroGeneral; etiqueta: string }> = FUENTES_PARAMETRO_GENERAL.map((f) => ({
  valor: f.valor,
  etiqueta: `${f.etiqueta} — ej.: ${ejemploParaFuente(f.valor)}`
}));

/**
 * Nombre de token por defecto para cada fuente — el usuario puede cambiar
 * la notación (p. ej. renombrar "periodo" a "idPeriodo"), pero cada una de
 * las 11 fuentes siempre existe como un parámetro, sin poder agregarse ni
 * quitarse: no tiene sentido "agregar" una fuente que ya está cubierta, ni
 * "quitar" una y dejar el script sin forma de referenciarla.
 */
const NOMBRE_POR_DEFECTO_FUENTE: Record<FuenteParametroGeneral, string> = {
  PeriodoId: 'periodo',
  PeriodoEtiqueta: 'periodoEtiqueta',
  FechaInicio: 'fechaInicio',
  FechaFin: 'fechaFin',
  Anio: 'anio',
  MesNumero: 'mesNumero',
  MesNombre: 'mesNombre',
  MesesNumeroLista: 'mesesNumero',
  MesesNombreLista: 'mesesNombre',
  Numero: 'numero',
  Periodicidad: 'periodicidad'
};

/** Un parámetro general por cada fuente, con su nombre de token por defecto — usado para un origen nuevo. */
function parametrosGeneralesPorDefecto(): ParametroGeneral[] {
  return FUENTES_PARAMETRO_GENERAL.map((f) => ({ nombre: NOMBRE_POR_DEFECTO_FUENTE[f.valor], fuente: f.valor }));
}

/**
 * Completa un `parametrosGenerales` con las fuentes que falten (orígenes
 * guardados antes de este cambio, o con un JSON editado a mano) y descarta
 * duplicados de una misma fuente (se conserva el primero) — el resultado
 * siempre tiene exactamente una entrada por cada una de las 11 fuentes, en
 * el mismo orden que `FUENTES_PARAMETRO_GENERAL`.
 */
function normalizarParametrosGenerales(actuales: ParametroGeneral[]): ParametroGeneral[] {
  return FUENTES_PARAMETRO_GENERAL.map((f) => {
    const existente = actuales.find((p) => p.fuente === f.valor);
    return existente ?? { nombre: NOMBRE_POR_DEFECTO_FUENTE[f.valor], fuente: f.valor };
  });
}

/** Editor de parámetros generales: una fila fija por fuente (siempre las 11), solo se edita el nombre del token. */
function EditorParametrosGenerales({
  parametros, onChange
}: {
  parametros: ParametroGeneral[];
  onChange: (parametros: ParametroGeneral[]) => void;
}): React.JSX.Element {
  const actualizarNombre = (fuente: FuenteParametroGeneral, nombre: string): void => {
    onChange(parametros.map((p) => (p.fuente === fuente ? { ...p, nombre } : p)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {OPCIONES_FUENTE.map((f) => {
        const parametro = parametros.find((p) => p.fuente === f.valor);
        return (
          <div key={f.valor} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="texto-suave" style={{ flex: 2 }}>{f.etiqueta}</span>
            <input
              type="text"
              placeholder="nombre del token"
              value={parametro?.nombre ?? NOMBRE_POR_DEFECTO_FUENTE[f.valor]}
              onChange={(e) => actualizarNombre(f.valor, e.target.value)}
              data-testid={`origen-parametro-general-nombre-${f.valor}`}
              style={{ flex: 1 }}
            />
          </div>
        );
      })}
    </div>
  );
}

function SeccionResponsables(): React.JSX.Element {
  const [items, setItems] = useState<Responsable[]>([]);
  const [editando, setEditando] = useState<Responsable | null>(null);
  const [mostrarEliminados, setMostrarEliminados] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);

  const cargar = useCallback(async (): Promise<void> => {
    setItems(await invocar('responsables:listar', { incluirEliminados: mostrarEliminados }));
  }, [mostrarEliminados]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Recargado también al abrir el editor (no solo al montar): un equipo creado en `SeccionEquipos`
  // (componente hermano, montado a la vez que este) no dispararía este efecto de otro modo.
  const cargarEquipos = useCallback(async (): Promise<void> => {
    setEquipos(await invocar('equipos:listar', undefined));
  }, []);

  useEffect(() => {
    void cargarEquipos();
  }, [cargarEquipos]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    await invocar('responsables:guardar', editando);
    setEditando(null);
    await cargar();
  };

  const eliminar = async (id: string): Promise<void> => {
    try {
      await invocar('responsables:eliminar', { id });
      setEditando(null);
      setErrores([]);
      await cargar();
    } catch (error) {
      const e = error as Error & { detalles?: string[] };
      setErrores(e.detalles?.length ? e.detalles : [e.message]);
    }
  };

  const restaurar = async (id: string): Promise<void> => {
    await invocar('responsables:restaurar', { id });
    await cargar();
  };

  return (
    <div className="tarjeta">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Responsables</h3>
        <div className="separador" />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={mostrarEliminados}
            onChange={(e) => setMostrarEliminados(e.target.checked)}
            style={{ width: 'auto' }}
            data-testid="responsables-mostrar-eliminados"
          />
          Mostrar eliminados
        </label>
        <button
          className="boton primario"
          onClick={() => { void cargarEquipos(); setEditando(responsableVacio()); }}
          data-testid="nuevo-responsable"
        >
          <Icono nombre="mas" /> Responsable
        </button>
      </div>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Activo</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr
                key={r.id}
                className={r.eliminado ? 'fila-eliminada' : undefined}
                onClick={() => { if (r.eliminado) return; void cargarEquipos(); setEditando(r); }}
                style={{ cursor: r.eliminado ? 'default' : 'pointer' }}
                data-testid={`responsable-${r.nombre}`}
              >
                <td>{r.nombre} {r.eliminado && <span className="etiqueta-eliminado">Eliminado</span>}</td>
                <td className="texto-suave">{r.correo ?? '—'}</td>
                <td>{r.activo ? 'Sí' : 'No'}</td>
                <td>
                  {r.eliminado && (
                    <button
                      className="boton sutil"
                      title="Restaurar"
                      onClick={(e) => { e.stopPropagation(); void restaurar(r.id); }}
                      data-testid={`restaurar-${r.id}`}
                    >
                      Restaurar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <Vacio mensaje="Sin responsables" detalle="Créelos para asignarlos a indicadores." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <PanelLateral
          titulo={editando.id ? 'Editar responsable' : 'Nuevo responsable'}
          alCerrar={() => { setEditando(null); setErrores([]); }}
          pie={
            <>
              {editando.id && (
                <button className="boton peligro" onClick={() => void eliminar(editando.id)}>
                  Eliminar
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => { setEditando(null); setErrores([]); }}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-responsable">Guardar</button>
            </>
          }
        >
          {errores.length > 0 && (
            <div className="aviso error" data-testid="responsable-error-eliminar">
              {errores.map((e) => <div key={e}>{e}</div>)}
            </div>
          )}
          <Campo etiqueta="Nombre" obligatorio>
            <input type="text" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} autoFocus data-testid="responsable-nombre" />
          </Campo>
          <Campo etiqueta="Correo">
            <input type="email" value={editando.correo ?? ''} onChange={(e) => setEditando({ ...editando, correo: e.target.value || null })} />
          </Campo>
          <Campo etiqueta="Equipo">
            <select
              value={editando.equipoId ?? ''}
              onChange={(e) => setEditando({ ...editando, equipoId: e.target.value || null })}
              data-testid="responsable-equipo"
            >
              <option value="">— (sin equipo) —</option>
              {ordenarJerarquia(equipos.filter((eq) => !eq.eliminado)).map((eq) => (
                <option key={eq.id} value={eq.id}>{'—'.repeat(eq.nivel)} {eq.nombre}</option>
              ))}
            </select>
            <span className="texto-suave">
              Determina el vínculo indirecto de los indicadores de este responsable con un equipo.
            </span>
          </Campo>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={editando.activo} onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
            Activo
          </label>
        </PanelLateral>
      )}
    </div>
  );
}

function SeccionCategorias(): React.JSX.Element {
  const [items, setItems] = useState<Categoria[]>([]);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [mostrarEliminados, setMostrarEliminados] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);

  const cargar = useCallback(async (): Promise<void> => {
    setItems(await invocar('categorias:listar', { incluirEliminados: mostrarEliminados }));
  }, [mostrarEliminados]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    await invocar('categorias:guardar', editando);
    setEditando(null);
    await cargar();
  };

  const eliminar = async (id: string): Promise<void> => {
    try {
      await invocar('categorias:eliminar', { id });
      setEditando(null);
      setErrores([]);
      await cargar();
    } catch (error) {
      const e = error as Error & { detalles?: string[] };
      setErrores(e.detalles?.length ? e.detalles : [e.message]);
    }
  };

  const restaurar = async (id: string): Promise<void> => {
    await invocar('categorias:restaurar', { id });
    await cargar();
  };

  const filas = ordenarJerarquia(items);
  // Opciones válidas de "categoría padre": excluye la propia categoría en edición y sus descendientes
  // (evita ciclos client-side; el backend vuelve a validarlo con `sinCiclo`), y las ya eliminadas.
  const opcionesPadre = editando
    ? ordenarJerarquia(items.filter((c) => !c.eliminado)).filter(
        (c) => c.id !== editando.id && sinCiclo(editando.id, c.id, items)
      )
    : [];

  return (
    <div className="tarjeta">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Categorías</h3>
        <div className="separador" />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={mostrarEliminados}
            onChange={(e) => setMostrarEliminados(e.target.checked)}
            style={{ width: 'auto' }}
            data-testid="categorias-mostrar-eliminados"
          />
          Mostrar eliminados
        </label>
        <button className="boton primario" onClick={() => setEditando(categoriaVacia())} data-testid="nueva-categoria">
          <Icono nombre="mas" /> Categoría
        </button>
      </div>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Prefijo</th>
              <th>Descripción</th>
              <th>Activa</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr
                key={c.id}
                className={c.eliminado ? 'fila-eliminada' : undefined}
                onClick={() => !c.eliminado && setEditando(c)}
                style={{ cursor: c.eliminado ? 'default' : 'pointer' }}
                data-testid={`categoria-${c.nombre}`}
              >
                <td style={{ paddingLeft: 12 + c.nivel * 20 }}>
                  {c.nombre} {c.eliminado && <span className="etiqueta-eliminado">Eliminado</span>}
                </td>
                <td className="texto-suave">{c.prefijo ?? '—'}</td>
                <td className="texto-suave">{c.descripcion || '—'}</td>
                <td>{c.activo ? 'Sí' : 'No'}</td>
                <td>
                  {c.eliminado && (
                    <button
                      className="boton sutil"
                      title="Restaurar"
                      onClick={(e) => { e.stopPropagation(); void restaurar(c.id); }}
                      data-testid={`restaurar-${c.id}`}
                    >
                      Restaurar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Vacio mensaje="Sin categorías" detalle="Créelas para clasificar indicadores." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <PanelLateral
          titulo={editando.id ? 'Editar categoría' : 'Nueva categoría'}
          alCerrar={() => { setEditando(null); setErrores([]); }}
          pie={
            <>
              {editando.id && (
                <button className="boton peligro" onClick={() => void eliminar(editando.id)}>
                  Eliminar
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => { setEditando(null); setErrores([]); }}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-categoria">Guardar</button>
            </>
          }
        >
          {errores.length > 0 && (
            <div className="aviso error" data-testid="categoria-error-eliminar">
              {errores.map((e) => <div key={e}>{e}</div>)}
            </div>
          )}
          <Campo etiqueta="Nombre" obligatorio>
            <input type="text" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} autoFocus data-testid="categoria-nombre" />
          </Campo>
          <Campo etiqueta="Descripción">
            <textarea rows={2} value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} />
          </Campo>
          <Campo etiqueta="Prefijo">
            <input
              type="text"
              value={editando.prefijo ?? ''}
              onChange={(e) => setEditando({ ...editando, prefijo: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') || null })}
              data-testid="categoria-prefijo"
            />
            <span className="texto-suave">
              Opcional, alfabético en mayúsculas. Puramente visual: antepone «PREFIJO-» al código del indicador al mostrarlo, sin afectar el código guardado ni las referencias de fórmulas.
            </span>
          </Campo>
          <Campo etiqueta="Categoría padre">
            <select
              value={editando.padreId ?? ''}
              onChange={(e) => setEditando({ ...editando, padreId: e.target.value || null })}
              data-testid="categoria-padre"
            >
              <option value="">— (categoría raíz) —</option>
              {opcionesPadre.map((c) => (
                <option key={c.id} value={c.id}>{'—'.repeat(c.nivel)} {c.nombre}</option>
              ))}
            </select>
          </Campo>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={editando.activo} onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
            Activa
          </label>
        </PanelLateral>
      )}
    </div>
  );
}

/**
 * Equipos jerárquicos (Batch R), mismo patrón CRUD que `SeccionCategorias`
 * más un sub-panel "Indicadores de este equipo": lista TODOS los
 * indicadores marcando su vínculo con el equipo en edición — directo
 * (`Indicador.equipo`, checkbox editable, togglea vía
 * `indicadores:reasignarMasivo`), indirecto (vía `Responsable.equipoId`,
 * informativo — ese vínculo se cambia asignando/quitando el responsable
 * del indicador, no desde acá) o ninguno (checkbox editable para vincular
 * directo).
 */
function SeccionEquipos(): React.JSX.Element {
  const [items, setItems] = useState<Equipo[]>([]);
  const [editando, setEditando] = useState<Equipo | null>(null);
  const [mostrarEliminados, setMostrarEliminados] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  const [responsables, setResponsables] = useState<Responsable[]>([]);
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);

  const cargar = useCallback(async (): Promise<void> => {
    setItems(await invocar('equipos:listar', { incluirEliminados: mostrarEliminados }));
  }, [mostrarEliminados]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // También recargado al abrir el editor (no solo al montar): un responsable o indicador
  // creado mientras este componente ya estaba montado no dispararía este efecto de otro modo.
  const cargarResponsablesEIndicadores = useCallback(async (): Promise<void> => {
    setResponsables(await invocar('responsables:listar', undefined));
    setIndicadores(await invocar('indicadores:listar', undefined));
  }, []);

  useEffect(() => {
    void cargarResponsablesEIndicadores();
  }, [cargarResponsablesEIndicadores]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    await invocar('equipos:guardar', editando);
    setEditando(null);
    await cargar();
  };

  const eliminar = async (id: string): Promise<void> => {
    try {
      await invocar('equipos:eliminar', { id });
      setEditando(null);
      setErrores([]);
      await cargar();
    } catch (error) {
      const e = error as Error & { detalles?: string[] };
      setErrores(e.detalles?.length ? e.detalles : [e.message]);
    }
  };

  const restaurar = async (id: string): Promise<void> => {
    await invocar('equipos:restaurar', { id });
    await cargar();
  };

  const alternarVinculoDirecto = async (indicadorId: string, vincular: boolean): Promise<void> => {
    if (!editando) return;
    await invocar('indicadores:reasignarMasivo', { ids: [indicadorId], equipo: vincular ? editando.id : null });
    setIndicadores(await invocar('indicadores:listar', undefined));
  };

  const filas = ordenarJerarquia(items);
  const opcionesPadre = editando
    ? ordenarJerarquia(items.filter((e) => !e.eliminado)).filter(
        (e) => e.id !== editando.id && sinCiclo(editando.id, e.id, items)
      )
    : [];

  const responsablesPorId = new Map(responsables.map((r) => [r.id, r]));
  const vinculoDe = (i: Indicador): 'directo' | 'indirecto' | 'ninguno' => {
    if (!editando) return 'ninguno';
    if (i.equipo === editando.id) return 'directo';
    const resp = i.responsable ? responsablesPorId.get(i.responsable) : undefined;
    return resp?.equipoId === editando.id ? 'indirecto' : 'ninguno';
  };

  return (
    <div className="tarjeta">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Equipos</h3>
        <div className="separador" />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={mostrarEliminados}
            onChange={(e) => setMostrarEliminados(e.target.checked)}
            style={{ width: 'auto' }}
            data-testid="equipos-mostrar-eliminados"
          />
          Mostrar eliminados
        </label>
        <button
          className="boton primario"
          onClick={() => { void cargarResponsablesEIndicadores(); setEditando(equipoVacio()); }}
          data-testid="nuevo-equipo"
        >
          <Icono nombre="mas" /> Equipo
        </button>
      </div>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Descripción</th>
              <th>Activo</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {filas.map((eq) => (
              <tr
                key={eq.id}
                className={eq.eliminado ? 'fila-eliminada' : undefined}
                onClick={() => { if (eq.eliminado) return; void cargarResponsablesEIndicadores(); setEditando(eq); }}
                style={{ cursor: eq.eliminado ? 'default' : 'pointer' }}
                data-testid={`equipo-${eq.nombre}`}
              >
                <td style={{ paddingLeft: 12 + eq.nivel * 20 }}>
                  {eq.nombre} {eq.eliminado && <span className="etiqueta-eliminado">Eliminado</span>}
                </td>
                <td className="texto-suave">{eq.descripcion || '—'}</td>
                <td>{eq.activo ? 'Sí' : 'No'}</td>
                <td>
                  {eq.eliminado && (
                    <button
                      className="boton sutil"
                      title="Restaurar"
                      onClick={(e) => { e.stopPropagation(); void restaurar(eq.id); }}
                      data-testid={`restaurar-${eq.id}`}
                    >
                      Restaurar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <Vacio mensaje="Sin equipos" detalle="Créelos para agrupar indicadores organizacionalmente." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <PanelLateral
          titulo={editando.id ? 'Editar equipo' : 'Nuevo equipo'}
          alCerrar={() => { setEditando(null); setErrores([]); }}
          pie={
            <>
              {editando.id && (
                <button className="boton peligro" onClick={() => void eliminar(editando.id)}>
                  Eliminar
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => { setEditando(null); setErrores([]); }}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-equipo">Guardar</button>
            </>
          }
        >
          {errores.length > 0 && (
            <div className="aviso error" data-testid="equipo-error-eliminar">
              {errores.map((e) => <div key={e}>{e}</div>)}
            </div>
          )}
          <Campo etiqueta="Nombre" obligatorio>
            <input type="text" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} autoFocus data-testid="equipo-nombre" />
          </Campo>
          <Campo etiqueta="Descripción">
            <textarea rows={2} value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} />
          </Campo>
          <Campo etiqueta="Equipo padre">
            <select
              value={editando.padreId ?? ''}
              onChange={(e) => setEditando({ ...editando, padreId: e.target.value || null })}
              data-testid="equipo-padre"
            >
              <option value="">— (equipo raíz) —</option>
              {opcionesPadre.map((eq) => (
                <option key={eq.id} value={eq.id}>{'—'.repeat(eq.nivel)} {eq.nombre}</option>
              ))}
            </select>
          </Campo>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={editando.activo} onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
            Activo
          </label>

          {editando.id && (
            <>
              <h4 style={{ margin: '16px 0 8px' }}>Indicadores de este equipo</h4>
              <p className="texto-suave" style={{ marginTop: 0 }}>
                Directo: vinculado explícitamente a este equipo. Indirecto: vía el responsable asignado — cámbielo
                desde el indicador o su responsable, no aquí.
              </p>
              <div className="tabla-envoltura">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      <th>Vínculo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicadores.map((i) => {
                      const vinculo = vinculoDe(i);
                      return (
                        <tr key={i.id} data-testid={`equipo-indicador-${i.nombre}`}>
                          <td>
                            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: vinculo === 'indirecto' ? 'default' : 'pointer' }}>
                              <input
                                type="checkbox"
                                style={{ width: 'auto' }}
                                checked={vinculo !== 'ninguno'}
                                disabled={vinculo === 'indirecto'}
                                onChange={(e) => void alternarVinculoDirecto(i.id, e.target.checked)}
                                data-testid={`equipo-indicador-check-${i.nombre}`}
                              />
                              {i.nombre}
                            </label>
                          </td>
                          <td className="texto-suave">
                            {vinculo === 'directo' && 'Directo'}
                            {vinculo === 'indirecto' && 'Indirecto (responsable)'}
                            {vinculo === 'ninguno' && '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {indicadores.length === 0 && (
                      <tr>
                        <td colSpan={2}>
                          <Vacio mensaje="Sin indicadores" />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </PanelLateral>
      )}
    </div>
  );
}

function SeccionOrigenesAutomaticos(): React.JSX.Element {
  const [items, setItems] = useState<OrigenAutomatico[]>([]);
  const [editando, setEditando] = useState<OrigenAutomatico | null>(null);
  const [probando, setProbando] = useState(false);
  const [resultadoPrueba, setResultadoPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [scriptPrueba, setScriptPrueba] = useState('');
  const [probandoCodigo, setProbandoCodigo] = useState(false);
  const [resultadoCodigo, setResultadoCodigo] = useState<ResultadoPruebaCodigo | null>(null);
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const [mostrarEliminados, setMostrarEliminados] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);

  const cargar = useCallback(async (): Promise<void> => {
    setItems(await invocar('origenes:listar', { incluirEliminados: mostrarEliminados }));
  }, [mostrarEliminados]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    await invocar('origenes:guardar', editando);
    setEditando(null);
    await cargar();
  };

  const eliminar = async (id: string): Promise<void> => {
    try {
      await invocar('origenes:eliminar', { id });
      setEditando(null);
      setErrores([]);
      await cargar();
    } catch (error) {
      const e = error as Error & { detalles?: string[] };
      setErrores(e.detalles?.length ? e.detalles : [e.message]);
    }
  };

  const restaurar = async (id: string): Promise<void> => {
    await invocar('origenes:restaurar', { id });
    await cargar();
  };

  const probar = async (): Promise<void> => {
    if (!editando) return;
    setProbando(true);
    setResultadoPrueba(null);
    try {
      setResultadoPrueba(await invocar('origenes:probar', editando));
    } catch (error) {
      setResultadoPrueba({ ok: false, mensaje: (error as Error).message });
    } finally {
      setProbando(false);
    }
  };

  /**
   * A diferencia de "Probar conexión" (solo valida credenciales), ejecuta de
   * verdad el script/consulta ingresado contra el origen y muestra el
   * resultado real (tabla o error) — útil para validar un SELECT/consulta
   * antes de usarlo en la automatización de un indicador.
   */
  const probarCodigo = async (): Promise<void> => {
    if (!editando || !scriptPrueba.trim()) return;
    setProbandoCodigo(true);
    setResultadoCodigo(null);
    setErrorCodigo(null);
    try {
      setResultadoCodigo(await invocar('origenes:probarCodigo', { origen: editando, script: scriptPrueba }));
    } catch (error) {
      setErrorCodigo((error as Error).message);
    } finally {
      setProbandoCodigo(false);
    }
  };

  return (
    <div className="tarjeta">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Orígenes automáticos</h3>
        <div className="separador" />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={mostrarEliminados}
            onChange={(e) => setMostrarEliminados(e.target.checked)}
            style={{ width: 'auto' }}
            data-testid="origenes-mostrar-eliminados"
          />
          Mostrar eliminados
        </label>
        <button className="boton primario" onClick={() => setEditando(origenVacio())} data-testid="nuevo-origen">
          <Icono nombre="mas" /> Origen
        </button>
      </div>
      <p className="texto-suave">
        Conexiones externas (XMLA, SQL, API, PowerBI) para obtener resultados de indicadores sin captura manual. XMLA se
        soporta de mejor esfuerzo (consultas MDX de 2 ejes, autenticación Basic, OAuth2 o Microsoft con inicio de sesión;
        sin Windows/NTLM) y solo funciona contra SSAS on-premise clásico — Power BI Premium/Fabric y Azure Analysis
        Services solo son alcanzables con el proveedor propietario MSOLAP (el mismo que usan DAX Studio o Tabular
        Editor), que esta app no puede replicar. Para un dataset de Power BI en la nube use el tipo &quot;PowerBI&quot;
        en su lugar: consultas DAX vía la API REST pública &quot;Execute Queries&quot;, que sí es HTTPS+JSON estándar.
      </p>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Activo</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr
                key={o.id}
                className={o.eliminado ? 'fila-eliminada' : undefined}
                onClick={() => !o.eliminado && setEditando({ ...o, parametrosGenerales: normalizarParametrosGenerales(o.parametrosGenerales) })}
                style={{ cursor: o.eliminado ? 'default' : 'pointer' }}
                data-testid={`origen-${o.nombre}`}
              >
                <td>{o.nombre} {o.eliminado && <span className="etiqueta-eliminado">Eliminado</span>}</td>
                <td className="texto-suave">{o.tipo}</td>
                <td>{o.activo ? 'Sí' : 'No'}</td>
                <td>
                  {o.eliminado && (
                    <button
                      className="boton sutil"
                      title="Restaurar"
                      onClick={(e) => { e.stopPropagation(); void restaurar(o.id); }}
                      data-testid={`restaurar-${o.id}`}
                    >
                      Restaurar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <Vacio mensaje="Sin orígenes automáticos" detalle="Créelos para asignarlos a indicadores." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <PanelLateral
          titulo={editando.id ? 'Editar origen automático' : 'Nuevo origen automático'}
          alCerrar={() => {
            setEditando(null); setResultadoPrueba(null); setErrores([]);
            setScriptPrueba(''); setResultadoCodigo(null); setErrorCodigo(null);
          }}
          pie={
            <>
              {editando.id && (
                <button className="boton peligro" onClick={() => void eliminar(editando.id)}>
                  Eliminar
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button
                className="boton"
                onClick={() => {
                  setEditando(null); setResultadoPrueba(null); setErrores([]);
                  setScriptPrueba(''); setResultadoCodigo(null); setErrorCodigo(null);
                }}
              >
                Cancelar
              </button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-origen">Guardar</button>
            </>
          }
        >
          {errores.length > 0 && (
            <div className="aviso error" data-testid="origen-error-eliminar">
              {errores.map((e) => <div key={e}>{e}</div>)}
            </div>
          )}
          <Campo etiqueta="Nombre" obligatorio>
            <input type="text" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} autoFocus data-testid="origen-nombre" />
          </Campo>
          <Campo etiqueta="Tipo" obligatorio>
            <select
              value={editando.tipo}
              onChange={(e) => {
                const tipo = e.target.value as TipoOrigenAutomatico;
                // Se escribe explícito, no solo se deja al fallback visual de `autenticacionEfectiva`:
                // así lo que se guarda coincide siempre con lo que la UI mostró al crear el origen.
                const configuracion: Record<string, string> = tipo === 'PowerBI' ? { autenticacion: 'microsoft' } : {};
                setEditando({ ...editando, tipo, configuracion });
                setResultadoPrueba(null);
              }}
              data-testid="origen-tipo"
            >
              <option value="XMLA">XMLA</option>
              <option value="SQL">SQL</option>
              <option value="API">API</option>
              <option value="PowerBI">PowerBI (API REST, DAX)</option>
            </select>
          </Campo>
          <Campo etiqueta="Descripción">
            <textarea rows={2} value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} />
          </Campo>
          {CAMPOS_POR_TIPO[editando.tipo].map((campo) => (
            <Campo key={campo.clave} etiqueta={campo.etiqueta}>
              <input
                type={campo.sensible ? 'password' : 'text'}
                value={editando.configuracion[campo.clave] ?? ''}
                onChange={(e) =>
                  setEditando({ ...editando, configuracion: { ...editando.configuracion, [campo.clave]: e.target.value } })
                }
                data-testid={`origen-campo-${campo.clave}`}
              />
            </Campo>
          ))}
          {(editando.tipo === 'XMLA' || editando.tipo === 'PowerBI') && (
            <>
              <Campo etiqueta="Autenticación">
                <select
                  value={autenticacionEfectiva(editando)}
                  onChange={(e) =>
                    setEditando({ ...editando, configuracion: { ...editando.configuracion, autenticacion: e.target.value } })
                  }
                  data-testid={editando.tipo === 'XMLA' ? 'origen-xmla-autenticacion' : 'origen-powerbi-autenticacion'}
                >
                  {editando.tipo === 'XMLA' && <option value="basic">Basic (usuario/contraseña)</option>}
                  <option value="oauth2">OAuth2 (Client Credentials, app-únicamente)</option>
                  <option value="microsoft">Microsoft (iniciar sesión, delegado)</option>
                </select>
                <span className="texto-suave">
                  {editando.tipo === 'PowerBI'
                    ? 'La API REST de Power BI solo admite OAuth2 o Microsoft (nunca Basic) — por eso "Microsoft" es la opción por defecto aquí. "Microsoft" abre una ventana para iniciar sesión con su propia cuenta al probar la conexión, como en DAX Studio o Tabular Editor.'
                    : 'Power BI Premium/Fabric y Azure Analysis Services requieren OAuth2 o Microsoft; SSAS on-premise clásico suele usar Basic. "Microsoft" abre una ventana para iniciar sesión con su propia cuenta al probar la conexión, como en DAX Studio o Tabular Editor.'}
                </span>
              </Campo>
              {autenticacionEfectiva(editando) === 'microsoft' && (
                <div className="aviso info" style={{ margin: '0 0 8px' }}>
                  <strong>Client ID:</strong> Azure AD exige que la redirect URI del login esté registrada en la app
                  correspondiente al Client ID, así que en la práctica hace falta una — no existe un &quot;cliente público
                  universal&quot; que sirva para cualquier tenant. Si deja el campo en blanco, se intenta con un cliente
                  reutilizado por otras herramientas (puede fallar según las políticas de su organización). Lo confiable:
                  registre una app propia en Azure Portal → <em>Registros de aplicaciones</em> → <em>Nueva</em> → agregue la
                  plataforma <em>&quot;Aplicaciones móviles y de escritorio&quot;</em> con la redirect URI sugerida{' '}
                  <code>https://login.microsoftonline.com/common/oauth2/nativeclient</code> → en <em>API permissions</em>{' '}
                  agregue Power BI Service o Azure Analysis Services (delegado, <code>user_impersonation</code>) y dé
                  consentimiento → copie el Client ID (Application ID) aquí.
                </div>
              )}
              {(autenticacionEfectiva(editando) === 'microsoft'
                ? CAMPOS_MICROSOFT
                : autenticacionEfectiva(editando) === 'oauth2'
                  ? CAMPOS_OAUTH2
                  : CAMPOS_XMLA_BASIC
              ).map((campo) => (
                <Campo key={campo.clave} etiqueta={campo.etiqueta}>
                  <input
                    type={campo.sensible ? 'password' : 'text'}
                    value={editando.configuracion[campo.clave] ?? ''}
                    onChange={(e) =>
                      setEditando({ ...editando, configuracion: { ...editando.configuracion, [campo.clave]: e.target.value } })
                    }
                    data-testid={`origen-campo-${campo.clave}`}
                  />
                </Campo>
              ))}
            </>
          )}
          <div className="toolbar">
            <button className="boton" onClick={() => void probar()} disabled={probando} data-testid="origen-probar">
              {probando ? 'Probando…' : 'Probar conexión'}
            </button>
          </div>
          {(editando.tipo === 'XMLA' || editando.tipo === 'PowerBI') && autenticacionEfectiva(editando) === 'microsoft' && (
            <p className="texto-suave" style={{ margin: 0 }}>
              &quot;Probar conexión&quot; abrirá una ventana para iniciar sesión con Microsoft la primera vez (y cada vez que
              la sesión guardada haya vencido); las siguientes veces se reutiliza el token en silencio.
            </p>
          )}
          {resultadoPrueba && (
            <div className={`aviso ${resultadoPrueba.ok ? 'exito' : 'error'}`} data-testid="origen-resultado-prueba">
              {resultadoPrueba.mensaje}
            </div>
          )}

          <h4 style={{ margin: '8px 0 0' }}>Probar código</h4>
          <p className="texto-suave" style={{ margin: 0 }}>
            A diferencia de &quot;Probar conexión&quot; (solo valida credenciales), ejecuta de verdad el código ingresado
            (p. ej. un SELECT en SQL) y muestra el resultado real, para validarlo antes de usarlo en un indicador.
          </p>
          <Campo etiqueta="Código de prueba">
            <textarea
              rows={4}
              value={scriptPrueba}
              onChange={(e) => setScriptPrueba(e.target.value)}
              placeholder={editando.tipo === 'PowerBI' ? "p. ej. EVALUATE TOPN(10, 'Ventas')" : 'p. ej. SELECT TOP 10 * FROM Ventas'}
              data-testid="origen-script-prueba"
            />
          </Campo>
          <div className="toolbar">
            <button
              className="boton"
              onClick={() => void probarCodigo()}
              disabled={probandoCodigo || !scriptPrueba.trim()}
              data-testid="origen-probar-codigo"
            >
              {probandoCodigo ? 'Probando…' : 'Probar código'}
            </button>
          </div>
          {errorCodigo && (
            <div className="aviso error" data-testid="origen-resultado-codigo">{errorCodigo}</div>
          )}
          {resultadoCodigo && (
            resultadoCodigo.totalFilas === 0 ? (
              <Vacio mensaje="La consulta no devolvió filas." />
            ) : (
              <>
                <div className="tabla-envoltura">
                  <table className="tabla" data-testid="origen-tabla-codigo">
                    <thead>
                      <tr>
                        {resultadoCodigo.columnas.map((c) => <th key={c}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {resultadoCodigo.filas.map((fila, i) => (
                        <tr key={i}>
                          {resultadoCodigo.columnas.map((c) => <td key={c}>{fila[c]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {resultadoCodigo.truncado && (
                  <p className="texto-suave" style={{ margin: 0 }}>
                    Mostrando 100 de {resultadoCodigo.totalFilas} filas. El límite es solo de visualización: la consulta se
                    ejecuta y se transfiere completa antes de recortarse, así que evite probar consultas sin filtros sobre
                    tablas muy grandes.
                  </p>
                )}
              </>
            )
          )}

          <h4 style={{ margin: '8px 0 0' }}>Parámetros generales del período</h4>
          <p className="texto-suave" style={{ margin: 0 }}>
            Cómo se nombra el período al sustituirlo en el script de cada indicador: un único valor, un rango de fechas
            (desde/hasta), año y mes por separado (numérico o textual), listas de meses, etc. Cada fuente ya tiene un
            parámetro con un nombre de token por defecto — cámbielo si su script espera otra notación.
          </p>
          <EditorParametrosGenerales
            parametros={editando.parametrosGenerales}
            onChange={(parametrosGenerales) => setEditando({ ...editando, parametrosGenerales })}
          />

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', marginTop: 8 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={editando.activo} onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
            Activo
          </label>
        </PanelLateral>
      )}
    </div>
  );
}

interface UsuarioFila {
  id: string;
  nombreUsuario: string;
  nombreCompleto: string;
  rol: RolUsuario;
  activo: boolean;
}

function usuarioNuevoVacio(): { nombreUsuario: string; nombreCompleto: string; password: string; rol: RolUsuario } {
  return { nombreUsuario: '', nombreCompleto: '', password: '', rol: 'usuario' };
}

/**
 * Gestión de usuarios (nueva en la Fase 4 — sin equivalente en la app de
 * escritorio, que operaba con un único `USUARIO_LOCAL` implícito). Habla
 * directo con el cliente tRPC (no pasa por el shim `invocar()`, ya que
 * `usuarios:*` nunca tuvo canal IPC — ver plan §9.7). El componente padre
 * (`AdminPage`) solo la monta si `usuario.rol === 'admin'`; los
 * procedimientos además son `adminProcedure` del lado del servidor, así que
 * ocultarla aquí es una conveniencia de UX, no la única barrera.
 */
function SeccionUsuarios(): React.JSX.Element {
  const [items, setItems] = useState<UsuarioFila[]>([]);
  const [creando, setCreando] = useState<ReturnType<typeof usuarioNuevoVacio> | null>(null);
  const [editandoPassword, setEditandoPassword] = useState<UsuarioFila | null>(null);
  const [passwordNueva, setPasswordNueva] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setItems(await trpcClient.usuarios.listar.query());
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const crear = async (): Promise<void> => {
    if (!creando) return;
    setError(null);
    try {
      await trpcClient.usuarios.crear.mutate(creando);
      setCreando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el usuario.');
    }
  };

  const alternarActivo = async (u: UsuarioFila): Promise<void> => {
    await trpcClient.usuarios.establecerActivo.mutate({ id: u.id, activo: !u.activo });
    await cargar();
  };

  const cambiarRol = async (u: UsuarioFila, rol: RolUsuario): Promise<void> => {
    await trpcClient.usuarios.establecerRol.mutate({ id: u.id, rol });
    await cargar();
  };

  const guardarPassword = async (): Promise<void> => {
    if (!editandoPassword || !passwordNueva) return;
    setError(null);
    try {
      await trpcClient.usuarios.cambiarPassword.mutate({ id: editandoPassword.id, passwordNueva });
      setEditandoPassword(null);
      setPasswordNueva('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.');
    }
  };

  return (
    <div className="tarjeta">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Usuarios</h3>
        <div className="separador" />
        <button className="boton primario" onClick={() => setCreando(usuarioNuevoVacio())} data-testid="nuevo-usuario">
          <Icono nombre="mas" /> Usuario
        </button>
      </div>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Nombre completo</th>
              <th>Rol</th>
              <th>Activo</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} data-testid={`usuario-${u.nombreUsuario}`}>
                <td>{u.nombreUsuario}</td>
                <td>{u.nombreCompleto}</td>
                <td>
                  <select
                    value={u.rol}
                    onChange={(e) => void cambiarRol(u, e.target.value as RolUsuario)}
                    data-testid={`usuario-rol-${u.nombreUsuario}`}
                  >
                    <option value="usuario">Usuario</option>
                    <option value="admin">Administrador</option>
                  </select>
                </td>
                <td>
                  <button className="boton sutil" onClick={() => void alternarActivo(u)} data-testid={`usuario-activo-${u.nombreUsuario}`}>
                    {u.activo ? 'Sí' : 'No'}
                  </button>
                </td>
                <td>
                  <button className="boton sutil" onClick={() => setEditandoPassword(u)} title="Cambiar contraseña">
                    Contraseña
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Vacio mensaje="Sin usuarios" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {creando && (
        <PanelLateral
          titulo="Nuevo usuario"
          alCerrar={() => { setCreando(null); setError(null); }}
          pie={
            <>
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => { setCreando(null); setError(null); }}>Cancelar</button>
              <button className="boton primario" onClick={() => void crear()} data-testid="guardar-usuario">Crear</button>
            </>
          }
        >
          {error && <div className="aviso error">{error}</div>}
          <Campo etiqueta="Usuario" obligatorio>
            <input
              type="text"
              value={creando.nombreUsuario}
              onChange={(e) => setCreando({ ...creando, nombreUsuario: e.target.value })}
              autoFocus
              data-testid="usuario-nombreUsuario"
            />
          </Campo>
          <Campo etiqueta="Nombre completo" obligatorio>
            <input type="text" value={creando.nombreCompleto} onChange={(e) => setCreando({ ...creando, nombreCompleto: e.target.value })} />
          </Campo>
          <Campo etiqueta="Contraseña" obligatorio>
            <input
              type="password"
              value={creando.password}
              onChange={(e) => setCreando({ ...creando, password: e.target.value })}
              data-testid="usuario-password"
            />
          </Campo>
          <Campo etiqueta="Rol">
            <select value={creando.rol} onChange={(e) => setCreando({ ...creando, rol: e.target.value as RolUsuario })}>
              <option value="usuario">Usuario</option>
              <option value="admin">Administrador</option>
            </select>
          </Campo>
        </PanelLateral>
      )}
      {editandoPassword && (
        <PanelLateral
          titulo={`Cambiar contraseña — ${editandoPassword.nombreUsuario}`}
          alCerrar={() => { setEditandoPassword(null); setPasswordNueva(''); setError(null); }}
          pie={
            <>
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => { setEditandoPassword(null); setPasswordNueva(''); setError(null); }}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardarPassword()} data-testid="confirmar-cambiar-password">Guardar</button>
            </>
          }
        >
          {error && <div className="aviso error">{error}</div>}
          <Campo etiqueta="Contraseña nueva" obligatorio>
            <input type="password" value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)} autoFocus data-testid="usuario-password-nueva" />
          </Campo>
        </PanelLateral>
      )}
    </div>
  );
}

/**
 * Administración: configuración portable (export/import de TODA la
 * configuración en un único JSON versionado, preparado para migraciones) y
 * catálogos de responsables/categorías asignables a indicadores.
 */
export function AdminPage(): React.JSX.Element {
  const { usuario } = useAuth();
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error' | 'info'; texto: string } | null>(null);
  const selectorArchivo = useRef<HTMLInputElement>(null);

  const exportar = async (): Promise<void> => {
    try {
      await descargar('/api/portable/exportar', `kpitracker-config-${new Date().toISOString().slice(0, 10)}.json`);
      setMensaje({ tipo: 'exito', texto: 'Configuración exportada correctamente.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: (error as Error).message });
    }
  };

  const importar = async (archivo: File): Promise<void> => {
    try {
      const json = await archivo.text();
      const { advertencias } = await postTexto<{ advertencias: string[] }>('/api/portable/importar', json);
      setMensaje({
        tipo: 'exito',
        texto:
          advertencias.length > 0
            ? `Configuración importada. ${advertencias.join(' ')}`
            : 'Configuración importada correctamente.'
      });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: `No se pudo importar: ${(error as Error).message}` });
    }
  };

  return (
    <>
      <Encabezado
        titulo="Administración"
        descripcion="Configuración portable, catálogos y mantenimiento del sistema."
      />
      {mensaje && <div className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div className="tarjeta">
        <h3 style={{ marginTop: 0 }}>Configuración portable</h3>
        <p className="texto-suave">
          Exporta indicadores, atributos, listas, reglas, desagregaciones, metas, periodicidades personalizadas,
          catálogos y parámetros generales en un único archivo JSON versionado. El archivo puede importarse en otra
          instalación; las versiones antiguas se migran automáticamente.
        </p>
        <div className="toolbar">
          <button className="boton primario" onClick={() => void exportar()} data-testid="exportar-config">
            <Icono nombre="exportar" /> Exportar configuración
          </button>
          <button className="boton" onClick={() => selectorArchivo.current?.click()} data-testid="importar-config">
            Importar configuración…
          </button>
          <input
            ref={selectorArchivo}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) void importar(archivo);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <TarjetaRespaldo />

      <SeccionResponsables />
      <SeccionCategorias />
      <SeccionEquipos />
      <SeccionOrigenesAutomaticos />

      {usuario?.rol === 'admin' && <SeccionUsuarios />}
    </>
  );
}
