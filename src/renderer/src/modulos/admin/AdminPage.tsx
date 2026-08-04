import { useCallback, useEffect, useRef, useState } from 'react';
import type { Categoria, OrigenAutomatico, Responsable, TipoOrigenAutomatico } from '@domain/index';
import { invocar } from '../../api';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

function responsableVacio(): Responsable {
  return { id: '', nombre: '', correo: null, activo: true, creadoEn: '', actualizadoEn: '' };
}

function categoriaVacia(): Categoria {
  return { id: '', nombre: '', descripcion: '', activo: true, creadoEn: '', actualizadoEn: '' };
}

function origenVacio(): OrigenAutomatico {
  return { id: '', nombre: '', tipo: 'API', descripcion: '', configuracion: {}, activo: true, creadoEn: '', actualizadoEn: '' };
}

/** Campos de configuración específicos por tipo de origen (clave dentro de `configuracion`, con máscara para credenciales). */
const CAMPOS_POR_TIPO: Record<TipoOrigenAutomatico, Array<{ clave: string; etiqueta: string; sensible?: boolean }>> = {
  XMLA: [
    { clave: 'servidor', etiqueta: 'Servidor XMLA' },
    { clave: 'catalogo', etiqueta: 'Catálogo / cubo' },
    { clave: 'usuario', etiqueta: 'Usuario' },
    { clave: 'contrasena', etiqueta: 'Contraseña', sensible: true }
  ],
  SQL: [
    { clave: 'cadenaConexion', etiqueta: 'Cadena de conexión', sensible: true },
    { clave: 'consulta', etiqueta: 'Consulta SQL (plantilla)' }
  ],
  API: [
    { clave: 'url', etiqueta: 'URL del endpoint' },
    { clave: 'metodo', etiqueta: 'Método (GET/POST)' },
    { clave: 'token', etiqueta: 'Token / API Key', sensible: true }
  ]
};

function SeccionResponsables(): React.JSX.Element {
  const [items, setItems] = useState<Responsable[]>([]);
  const [editando, setEditando] = useState<Responsable | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setItems(await invocar('responsables:listar', undefined));
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    await invocar('responsables:guardar', editando);
    setEditando(null);
    await cargar();
  };

  return (
    <div className="tarjeta">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Responsables</h3>
        <div className="separador" />
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
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} onClick={() => setEditando(r)} style={{ cursor: 'pointer' }} data-testid={`responsable-${r.nombre}`}>
                <td>{r.nombre}</td>
                <td className="texto-suave">{r.correo ?? '—'}</td>
                <td>{r.activo ? 'Sí' : 'No'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3}>
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
          alCerrar={() => setEditando(null)}
          pie={
            <>
              {editando.id && (
                <button
                  className="boton peligro"
                  onClick={() => {
                    void invocar('responsables:eliminar', { id: editando.id }).then(() => {
                      setEditando(null);
                      void cargar();
                    });
                  }}
                >
                  Eliminar
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-responsable">Guardar</button>
            </>
          }
        >
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

  const cargar = useCallback(async (): Promise<void> => {
    setItems(await invocar('categorias:listar', undefined));
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    await invocar('categorias:guardar', editando);
    setEditando(null);
    await cargar();
  };

  return (
    <div className="tarjeta">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Categorías</h3>
        <div className="separador" />
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
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} onClick={() => setEditando(c)} style={{ cursor: 'pointer' }} data-testid={`categoria-${c.nombre}`}>
                <td>{c.nombre}</td>
                <td className="texto-suave">{c.descripcion || '—'}</td>
                <td>{c.activo ? 'Sí' : 'No'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3}>
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
          alCerrar={() => setEditando(null)}
          pie={
            <>
              {editando.id && (
                <button
                  className="boton peligro"
                  onClick={() => {
                    void invocar('categorias:eliminar', { id: editando.id }).then(() => {
                      setEditando(null);
                      void cargar();
                    });
                  }}
                >
                  Eliminar
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-categoria">Guardar</button>
            </>
          }
        >
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

  const cargar = useCallback(async (): Promise<void> => {
    setItems(await invocar('origenes:listar', undefined));
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    await invocar('origenes:guardar', editando);
    setEditando(null);
    await cargar();
  };

  return (
    <div className="tarjeta">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Orígenes automáticos</h3>
        <div className="separador" />
        <button className="boton primario" onClick={() => setEditando(origenVacio())} data-testid="nuevo-origen">
          <Icono nombre="mas" /> Origen
        </button>
      </div>
      <p className="texto-suave">
        Conexiones externas (XMLA, SQL, API) para obtener resultados de indicadores sin captura manual. La ejecución real de la
        consulta aún no está disponible en esta versión; aquí solo se configuran el origen y sus credenciales.
      </p>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id} onClick={() => setEditando(o)} style={{ cursor: 'pointer' }} data-testid={`origen-${o.nombre}`}>
                <td>{o.nombre}</td>
                <td className="texto-suave">{o.tipo}</td>
                <td>{o.activo ? 'Sí' : 'No'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3}>
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
          alCerrar={() => setEditando(null)}
          pie={
            <>
              {editando.id && (
                <button
                  className="boton peligro"
                  onClick={() => {
                    void invocar('origenes:eliminar', { id: editando.id }).then(() => {
                      setEditando(null);
                      void cargar();
                    });
                  }}
                >
                  Eliminar
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-origen">Guardar</button>
            </>
          }
        >
          <Campo etiqueta="Nombre" obligatorio>
            <input type="text" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} autoFocus data-testid="origen-nombre" />
          </Campo>
          <Campo etiqueta="Tipo" obligatorio>
            <select
              value={editando.tipo}
              onChange={(e) => setEditando({ ...editando, tipo: e.target.value as TipoOrigenAutomatico, configuracion: {} })}
              data-testid="origen-tipo"
            >
              <option value="XMLA">XMLA</option>
              <option value="SQL">SQL</option>
              <option value="API">API</option>
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
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
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
