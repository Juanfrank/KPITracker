import { useCallback, useEffect, useRef, useState } from 'react';
import type { Categoria, FuenteParametroGeneral, OrigenAutomatico, ParametroGeneral, Responsable, TipoOrigenAutomatico } from '@domain/index';
import { ejemploParaFuente } from '@domain/index';
import type { ResultadoPruebaCodigo } from '@shared/ipc';
import { invocar } from '../../api';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

function responsableVacio(): Responsable {
  return { id: '', nombre: '', correo: null, activo: true, eliminado: false, creadoEn: '', actualizadoEn: '' };
}

function categoriaVacia(): Categoria {
  return { id: '', nombre: '', descripcion: '', activo: true, eliminado: false, creadoEn: '', actualizadoEn: '' };
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

  const cargar = useCallback(async (): Promise<void> => {
    setItems(await invocar('responsables:listar', { incluirEliminados: mostrarEliminados }));
  }, [mostrarEliminados]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

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
        <button className="boton primario" onClick={() => setEditando(responsableVacio())} data-testid="nuevo-responsable">
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
                onClick={() => !r.eliminado && setEditando(r)}
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
              <th>Descripción</th>
              <th>Activa</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr
                key={c.id}
                className={c.eliminado ? 'fila-eliminada' : undefined}
                onClick={() => !c.eliminado && setEditando(c)}
                style={{ cursor: c.eliminado ? 'default' : 'pointer' }}
                data-testid={`categoria-${c.nombre}`}
              >
                <td>{c.nombre} {c.eliminado && <span className="etiqueta-eliminado">Eliminado</span>}</td>
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
                <td colSpan={4}>
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
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={editando.activo} onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
            Activa
          </label>
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

/**
 * Administración: configuración portable (export/import de TODA la
 * configuración en un único JSON versionado, preparado para migraciones) y
 * catálogos de responsables/categorías asignables a indicadores.
 */
export function AdminPage(): React.JSX.Element {
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error' | 'info'; texto: string } | null>(null);
  const selectorArchivo = useRef<HTMLInputElement>(null);

  const exportar = async (): Promise<void> => {
    try {
      const { json } = await invocar('portable:exportar', undefined);
      const blob = new Blob([json], { type: 'application/json' });
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      enlace.download = `kpitracker-config-${new Date().toISOString().slice(0, 10)}.json`;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
      setMensaje({ tipo: 'exito', texto: 'Configuración exportada correctamente.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: (error as Error).message });
    }
  };

  const importar = async (archivo: File): Promise<void> => {
    try {
      const json = await archivo.text();
      const { advertencias } = await invocar('portable:importar', { json });
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

      <SeccionResponsables />
      <SeccionCategorias />
      <SeccionOrigenesAutomaticos />

      <div className="tarjeta">
        <h3 style={{ marginTop: 0 }}>Usuarios</h3>
        <p className="texto-suave" style={{ marginBottom: 0 }}>
          Esta versión opera con un único usuario local. La arquitectura ya contempla usuarios, aprobadores y flujos
          de revisión; se habilitarán en versiones futuras (ver roadmap en la documentación).
        </p>
      </div>
    </>
  );
}
