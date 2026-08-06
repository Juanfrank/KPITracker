import { useEffect, useRef, useState } from 'react';
import type { PerfilRegistrado } from '@shared/perfiles';
import { invocar } from '../../api';
import { Icono } from '../../componentes/Icono';
import { useNavegacion } from '../../stores/navegacion';

/**
 * Selector compacto de perfil, siempre visible en el pie del sidebar
 * (Batch P): muestra el perfil activo, despliega la lista completa para
 * cambio directo, y enlaza a la página `Perfiles` para el CRUD completo.
 */
export function SelectorPerfil(): React.JSX.Element {
  const [perfiles, setPerfiles] = useState<PerfilRegistrado[]>([]);
  const [activoId, setActivoId] = useState<string>('');
  const [abierto, setAbierto] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const { navegar } = useNavegacion();
  const contenedorRef = useRef<HTMLDivElement>(null);

  const cargar = async (): Promise<void> => {
    const { perfiles: lista, activoId: id } = await invocar('perfiles:listar', undefined);
    setPerfiles(lista);
    setActivoId(id);
  };

  useEffect(() => {
    void cargar();
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const alClicFuera = (e: MouseEvent): void => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alClicFuera);
    return () => document.removeEventListener('mousedown', alClicFuera);
  }, [abierto]);

  const usarPerfil = async (id: string): Promise<void> => {
    if (id === activoId) {
      setAbierto(false);
      return;
    }
    setAbierto(false);
    setCambiando(true);
    try {
      // main hace el swap completo (cerrar el perfil actual, abrir el nuevo) antes de resolver.
      await invocar('perfiles:cambiar', { id });
      window.location.reload();
    } catch {
      // Si falló, main ya reabrió el perfil anterior — solo se refresca este widget.
      setCambiando(false);
      void cargar();
    }
  };

  const activo = perfiles.find((p) => p.id === activoId);

  return (
    <div className="selector-perfil" ref={contenedorRef}>
      <button
        className="boton sutil selector-perfil-boton"
        onClick={() => setAbierto((v) => !v)}
        title="Cambiar de perfil"
        data-testid="selector-perfil"
      >
        <Icono nombre="perfiles" tamano={15} />
        <span className="selector-perfil-nombre">{activo?.nombre ?? '—'}</span>
      </button>
      {abierto && (
        <div className="selector-perfil-menu" data-testid="selector-perfil-menu">
          {perfiles.map((p) => (
            <button
              key={p.id}
              className="selector-perfil-item"
              onClick={() => void usarPerfil(p.id)}
              data-testid={p.id === activoId ? undefined : `usar-perfil-${p.id}`}
            >
              <span>{p.nombre}</span>
              {p.id === activoId && <span className="texto-suave">Activo</span>}
            </button>
          ))}
          <button
            className="selector-perfil-item selector-perfil-gestionar"
            onClick={() => {
              setAbierto(false);
              navegar('perfiles');
            }}
          >
            Gestionar perfiles…
          </button>
        </div>
      )}
      {cambiando && (
        <div className="overlay-cambio-perfil" data-testid="cambiando-perfil">
          <div className="tarjeta">Cambiando de perfil…</div>
        </div>
      )}
    </div>
  );
}
