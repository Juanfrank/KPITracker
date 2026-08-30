import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpcClient } from '../../trpc';
import { useAuth } from '../../auth/AuthContext';
import { Encabezado, Vacio } from '../../componentes/basicos';

/**
 * `Servicio > Administración > Cambiar workspace` (Batch AX) — reemplaza al
 * selector que antes vivía en el pie del sidebar (pedido explícito del
 * usuario: una página/panel dedicado, estilo lista de opciones con
 * confirmación, en vez de un `<select>` inline). Cambiar de workspace solo
 * mueve en cuál catálogo de `Rol` opera el usuario (ver docstring de
 * `Usuario.workspaceActualId`) — no reasigna sus roles dentro del nuevo
 * workspace, así que tras confirmar se navega a Seguimiento (mismo destino
 * que un login nuevo) en vez de quedarse en esta página.
 */
export function CambiarWorkspacePage(): React.JSX.Element {
  const { usuario, cambiarWorkspace } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; nombre: string; activo: boolean }>>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cambiando, setCambiando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    const items = await trpcClient.workspaces.listar.query();
    setWorkspaces(items);
    setSeleccionado((actual) => actual ?? usuario?.workspaceActualId ?? null);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const confirmar = async (): Promise<void> => {
    if (!seleccionado || seleccionado === usuario?.workspaceActualId) return;
    setError(null);
    setCambiando(true);
    try {
      await cambiarWorkspace(seleccionado);
      navigate('/seguimiento');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar de workspace.');
    } finally {
      setCambiando(false);
    }
  };

  return (
    <>
      <Encabezado
        titulo="Cambiar workspace"
        descripcion="Elija a cuál workspace cambiar — determina en qué catálogo de roles opera su sesión."
      />
      <div className="tarjeta">
        {error && <div className="aviso error">{error}</div>}
        {cargando ? (
          <Vacio mensaje="Cargando…" />
        ) : workspaces.length === 0 ? (
          <Vacio mensaje="Sin workspaces" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {workspaces.map((w) => {
              const esActual = w.id === usuario?.workspaceActualId;
              return (
                <label
                  key={w.id}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    background: seleccionado === w.id ? 'var(--superficie-2)' : undefined
                  }}
                  data-testid={`cambiar-workspace-opcion-${w.nombre}`}
                >
                  <input
                    type="radio"
                    name="workspace"
                    style={{ width: 'auto' }}
                    checked={seleccionado === w.id}
                    onChange={() => setSeleccionado(w.id)}
                  />
                  <span style={{ flex: 1 }}>
                    {w.nombre}
                    {esActual && <span className="texto-suave" style={{ marginLeft: 8 }}>(actual)</span>}
                  </span>
                  {!w.activo && <span className="texto-suave">Inactivo</span>}
                </label>
              );
            })}
          </div>
        )}
        <div className="toolbar" style={{ marginTop: 16 }}>
          <div className="separador" />
          <button
            className="boton primario"
            disabled={!seleccionado || seleccionado === usuario?.workspaceActualId || cambiando}
            onClick={() => void confirmar()}
            data-testid="confirmar-cambiar-workspace"
          >
            Cambiar
          </button>
        </div>
      </div>
    </>
  );
}
