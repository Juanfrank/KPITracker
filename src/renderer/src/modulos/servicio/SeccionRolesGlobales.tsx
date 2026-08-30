import { useCallback, useEffect, useState } from 'react';
import type { RolGlobal } from '@domain/index';
import { CATALOGO_PERMISOS_GLOBALES } from '@domain/index';
import { trpcClient } from '../../trpc';
import { Campo, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

function rolGlobalVacio(): RolGlobal {
  return { id: '', nombre: '', permisos: [], esSistema: false, creadoEn: '', actualizadoEn: '' };
}

/**
 * Catálogo de roles GLOBALES (Batch AX, fundación SaaS) — mismo patrón que
 * `SeccionRoles` (AdminPage.tsx), sin ámbito (un único catálogo, ver
 * `RolGlobal`): gobiernan la administración de los Workspaces mismos, no lo
 * que hay DENTRO de uno. Vive en su propia página (`Servicio >
 * Administración > Roles globales`, ver `App.tsx`), separada de la
 * Administración general.
 */
export function SeccionRolesGlobales(): React.JSX.Element {
  const [items, setItems] = useState<RolGlobal[]>([]);
  const [editando, setEditando] = useState<RolGlobal | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setItems(await trpcClient.rolesGlobales.listar.query());
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    setError(null);
    try {
      await trpcClient.rolesGlobales.guardar.mutate(editando);
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el rol global.');
    }
  };

  const eliminar = async (id: string): Promise<void> => {
    setError(null);
    try {
      await trpcClient.rolesGlobales.eliminar.mutate({ id });
      setEditando(null);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el rol global.');
    }
  };

  const alternarPermiso = (permiso: string): void => {
    if (!editando) return;
    setEditando({
      ...editando,
      permisos: editando.permisos.includes(permiso)
        ? editando.permisos.filter((p) => p !== permiso)
        : [...editando.permisos, permiso]
    });
  };

  return (
    <div className="tarjeta">
      <div className="toolbar">
        <h3 style={{ margin: 0 }}>Roles globales</h3>
        <div className="separador" />
        <button className="boton primario" onClick={() => setEditando(rolGlobalVacio())} data-testid="nuevo-rol-global">
          <Icono nombre="mas" /> Rol global
        </button>
      </div>
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Permisos</th>
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} onClick={() => setEditando(r)} style={{ cursor: 'pointer' }} data-testid={`rol-global-${r.nombre}`}>
                <td>{r.nombre} {r.esSistema && <span className="texto-suave">(sistema)</span>}</td>
                <td className="texto-suave">{r.permisos.length} permiso{r.permisos.length === 1 ? '' : 's'}</td>
                <td />
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={3}><Vacio mensaje="Sin roles globales" /></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editando && (
        <PanelLateral
          titulo={editando.id ? `Editar rol global — ${editando.nombre}` : 'Nuevo rol global'}
          alCerrar={() => { setEditando(null); setError(null); }}
          pie={
            <>
              {editando.id && !editando.esSistema && (
                <button className="boton peligro" onClick={() => void eliminar(editando.id)}>Eliminar</button>
              )}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => { setEditando(null); setError(null); }}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-rol-global">Guardar</button>
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
              disabled={editando.esSistema}
              data-testid="rol-global-nombre"
            />
            {editando.esSistema && <span className="texto-suave">Los roles del sistema no se pueden renombrar.</span>}
          </Campo>
          <Campo etiqueta="Permisos">
            {CATALOGO_PERMISOS_GLOBALES.map((p) => (
              <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto' }}
                  checked={editando.permisos.includes(p.id)}
                  onChange={() => alternarPermiso(p.id)}
                  data-testid={`rol-global-permiso-${p.id}`}
                />
                {p.etiqueta}
              </label>
            ))}
          </Campo>
        </PanelLateral>
      )}
    </div>
  );
}
