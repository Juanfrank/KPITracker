import { useCallback, useEffect, useState } from 'react';
import type { PerfilRegistrado } from '@shared/perfiles';
import { invocar } from '../../api';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';
import { TarjetaRespaldo } from './TarjetaRespaldo';

/**
 * CRUD de perfiles (Batch P): crear, renombrar, cambiar y eliminar (con
 * confirmación por nombre tecleado + opción de conservar los archivos en
 * disco). El respaldo/importación selectiva (`TarjetaRespaldo`) siempre
 * opera sobre el perfil activo — se muestra debajo del CRUD.
 */
export function PerfilesPage(): React.JSX.Element {
  const [perfiles, setPerfiles] = useState<PerfilRegistrado[]>([]);
  const [activoId, setActivoId] = useState<string>('');
  const [editando, setEditando] = useState<PerfilRegistrado | null>(null);
  const [creando, setCreando] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [nombreTecleado, setNombreTecleado] = useState('');
  const [conservarArchivos, setConservarArchivos] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    const { perfiles: lista, activoId: id } = await invocar('perfiles:listar', undefined);
    setPerfiles(lista);
    setActivoId(id);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cerrarPanel = (): void => {
    setEditando(null);
    setCreando(false);
    setNombreNuevo('');
    setConfirmandoEliminar(false);
    setNombreTecleado('');
    setConservarArchivos(false);
    setError(null);
  };

  const crear = async (): Promise<void> => {
    try {
      await invocar('perfiles:crear', { nombre: nombreNuevo });
      cerrarPanel();
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const renombrar = async (): Promise<void> => {
    if (!editando) return;
    try {
      await invocar('perfiles:renombrar', { id: editando.id, nombre: editando.nombre });
      cerrarPanel();
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const eliminar = async (): Promise<void> => {
    if (!editando) return;
    try {
      await invocar('perfiles:eliminar', { id: editando.id, borrarArchivos: !conservarArchivos });
      cerrarPanel();
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const usarPerfil = async (id: string): Promise<void> => {
    setCambiando(true);
    try {
      await invocar('perfiles:cambiar', { id });
      window.location.reload();
    } catch (e) {
      setCambiando(false);
      setError((e as Error).message);
    }
  };

  return (
    <>
      <Encabezado
        titulo="Perfiles"
        descripcion="Cada perfil es una base de datos completa e independiente (configuración, indicadores, resultados). No reemplaza la configuración portable."
        acciones={
          <button className="boton primario" onClick={() => setCreando(true)} data-testid="nuevo-perfil">
            <Icono nombre="mas" /> Nuevo perfil
          </button>
        }
      />
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Ruta</th>
              <th>Creado</th>
              <th>Estado</th>
              <th style={{ width: 110 }} />
            </tr>
          </thead>
          <tbody>
            {perfiles.map((p) => (
              <tr
                key={p.id}
                onClick={() => setEditando(p)}
                style={{ cursor: 'pointer' }}
                data-testid={`perfil-${p.nombre}`}
              >
                <td><strong>{p.nombre}</strong></td>
                <td className="texto-suave mono">{p.ruta}</td>
                <td className="texto-suave">{p.creadoEn.slice(0, 10)}</td>
                <td>{p.id === activoId ? <span className="chip completo">Activo</span> : <span className="texto-suave">—</span>}</td>
                <td>
                  {p.id !== activoId && (
                    <button
                      className="boton sutil"
                      onClick={(e) => { e.stopPropagation(); void usarPerfil(p.id); }}
                      data-testid={`usar-perfil-${p.id}`}
                    >
                      Usar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {perfiles.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Vacio mensaje="Sin perfiles" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {perfiles.length > 0 && <TarjetaRespaldo nombrePerfilActivo={perfiles.find((p) => p.id === activoId)?.nombre ?? ''} />}

      {creando && (
        <PanelLateral
          titulo="Nuevo perfil"
          alCerrar={cerrarPanel}
          pie={
            <>
              <button className="boton" onClick={cerrarPanel}>Cancelar</button>
              <button className="boton primario" onClick={() => void crear()} data-testid="guardar-perfil">Crear</button>
            </>
          }
        >
          {error && <div className="aviso error">{error}</div>}
          <Campo etiqueta="Nombre" obligatorio>
            <input type="text" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} autoFocus data-testid="perfil-nombre" />
          </Campo>
        </PanelLateral>
      )}

      {editando && (
        <PanelLateral
          titulo="Editar perfil"
          alCerrar={cerrarPanel}
          pie={
            !confirmandoEliminar ? (
              <>
                <button className="boton peligro" onClick={() => setConfirmandoEliminar(true)}>Eliminar</button>
                <span style={{ flex: 1 }} />
                <button className="boton" onClick={cerrarPanel}>Cancelar</button>
                <button className="boton primario" onClick={() => void renombrar()} data-testid="guardar-perfil">Guardar</button>
              </>
            ) : (
              <>
                <button className="boton" onClick={() => setConfirmandoEliminar(false)}>Volver</button>
                <span style={{ flex: 1 }} />
                <button
                  className="boton peligro"
                  disabled={nombreTecleado !== editando.nombre}
                  onClick={() => void eliminar()}
                  data-testid="confirmar-eliminar-perfil"
                >
                  Eliminar definitivamente
                </button>
              </>
            )
          }
        >
          {error && <div className="aviso error">{error}</div>}
          {!confirmandoEliminar ? (
            <>
              <Campo etiqueta="Nombre" obligatorio>
                <input
                  type="text"
                  value={editando.nombre}
                  onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                  autoFocus
                  data-testid="perfil-nombre"
                />
              </Campo>
              <Campo etiqueta="Ruta de datos">
                <input type="text" value={editando.ruta} readOnly className="mono" />
              </Campo>
              {editando.id === activoId && (
                <p className="texto-suave">Este es el perfil activo actualmente.</p>
              )}
            </>
          ) : (
            <>
              <div className="aviso error">
                Esta acción es irreversible. El perfil <strong>{editando.nombre}</strong> se quitará del registro
                {conservarArchivos ? '' : ' y sus archivos se borrarán del disco'}.
              </div>
              <Campo etiqueta={`Escriba "${editando.nombre}" para confirmar`} obligatorio>
                <input
                  type="text"
                  value={nombreTecleado}
                  onChange={(e) => setNombreTecleado(e.target.value)}
                  autoFocus
                  data-testid="perfil-confirmar-nombre"
                />
              </Campo>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={conservarArchivos}
                  onChange={(e) => setConservarArchivos(e.target.checked)}
                  style={{ width: 'auto' }}
                  data-testid="perfil-conservar-archivos"
                />
                Conservar los archivos en disco
              </label>
            </>
          )}
        </PanelLateral>
      )}

      {cambiando && (
        <div className="overlay-cambio-perfil" data-testid="cambiando-perfil">
          <div className="tarjeta">Cambiando de perfil…</div>
        </div>
      )}
    </>
  );
}
