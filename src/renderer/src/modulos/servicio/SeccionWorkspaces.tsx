import { useCallback, useEffect, useState } from 'react';
import type { Workspace } from '@domain/index';
import { trpcClient } from '../../trpc';
import { useAuth } from '../../auth/AuthContext';
import { puedeAdministrarWorkspaces, puedeCrearWorkspaces, puedeEliminarWorkspaces, puedeVerWorkspaces } from '../../auth/permisosNav';
import { Campo, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

function workspaceVacio(): Workspace {
  return { id: '', nombre: '', activo: true, eliminado: false, creadoEn: '', actualizadoEn: '' };
}

/**
 * Workspaces (Batch AX, fundación SaaS): la unidad de aislamiento de más
 * alto nivel — cada uno tiene su propio catálogo de `Rol` (ver
 * `SeccionRoles` en AdminPage.tsx, que siempre opera sobre "el workspace
 * actual" del usuario, no sobre todos). Solo visible a quien tenga algún
 * permiso GLOBAL puntual (`puedeVerWorkspaces`) — la enorme mayoría de los
 * usuarios, que opera en un único Workspace compartido, nunca la ve. El
 * Workspace por defecto del sistema no se puede eliminar (bloqueado en el
 * servidor, `referenciasDeWorkspace`).
 *
 * Vive en su propia página (`Servicio > Administración > Workspaces`, ver
 * `App.tsx`) — separada de la Administración general (Sistema), pedido
 * explícito del usuario: solo lo que es "configuración global" (Workspaces
 * + Roles globales) se mudó ahí, el resto de Administración quedó igual.
 */
export function SeccionWorkspaces(): React.JSX.Element {
  const { usuario } = useAuth();
  const [items, setItems] = useState<Workspace[]>([]);
  const [editando, setEditando] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setItems(await trpcClient.workspaces.listar.query());
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    setError(null);
    try {
      if (editando.id) {
        await trpcClient.workspaces.renombrar.mutate({ id: editando.id, nombre: editando.nombre });
        await trpcClient.workspaces.establecerActivo.mutate({ id: editando.id, activo: editando.activo });
      } else {
        await trpcClient.workspaces.crear.mutate({ nombre: editando.nombre });
      }
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el workspace.');
    }
  };

  const eliminar = async (id: string): Promise<void> => {
    setError(null);
    try {
      await trpcClient.workspaces.eliminar.mutate({ id });
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el workspace.');
    }
  };

  if (!usuario || !puedeVerWorkspaces(usuario)) return <></>;

  return (
    <div className="tarjeta">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Workspaces</h3>
        <div className="separador" />
        {puedeCrearWorkspaces(usuario) && (
          <button className="boton primario" onClick={() => setEditando(workspaceVacio())} data-testid="nuevo-workspace">
            <Icono nombre="mas" /> Workspace
          </button>
        )}
      </div>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr
                key={w.id}
                onClick={() => (puedeAdministrarWorkspaces(usuario) ? setEditando(w) : undefined)}
                style={{ cursor: puedeAdministrarWorkspaces(usuario) ? 'pointer' : undefined }}
                data-testid={`workspace-${w.nombre}`}
              >
                <td>{w.nombre}</td>
                <td className="texto-suave">{w.activo ? 'Activo' : 'Inactivo'}</td>
                <td />
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3}><Vacio mensaje="Sin workspaces" /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <PanelLateral
          titulo={editando.id ? `Editar workspace — ${editando.nombre}` : 'Nuevo workspace'}
          alCerrar={() => { setEditando(null); setError(null); }}
          pie={
            <>
              {editando.id && puedeEliminarWorkspaces(usuario) && (
                <button className="boton peligro" onClick={() => void eliminar(editando.id)}>Eliminar</button>
              )}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => { setEditando(null); setError(null); }}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-workspace">Guardar</button>
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
              data-testid="workspace-nombre"
            />
          </Campo>
          {editando.id && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={editando.activo}
                onChange={(e) => setEditando({ ...editando, activo: e.target.checked })}
                data-testid="workspace-activo"
              />
              Activo
            </label>
          )}
        </PanelLateral>
      )}
    </div>
  );
}
