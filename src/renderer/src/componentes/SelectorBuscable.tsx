import { useEffect, useRef, useState } from 'react';

export interface OpcionSelectorBuscable {
  value: string;
  etiqueta: string;
  /** Nivel de indentación (Batch X, X12) para expresar jerarquía visualmente — mismo criterio de indentación por nivel que ya usa AdminPage para categorías/equipos. */
  nivel?: number;
}

export interface GrupoSelectorBuscable {
  /** `null` = sin encabezado visible (lista plana, p. ej. Categoría). */
  etiqueta: string | null;
  opciones: OpcionSelectorBuscable[];
}

/**
 * Combobox con buscador (Batch X, X12): un `<input>` de texto que filtra en
 * vivo una lista de opciones — opcionalmente agrupadas (encabezados no
 * seleccionables) y opcionalmente indentadas para expresar jerarquía — en
 * un panel flotante. Mismo patrón visual/interacción que ya usa
 * `BusquedaGlobal` (Ctrl+K), adaptado a un campo de formulario. Reemplaza
 * un `<select>` nativo cuando la lista puede volverse larga (responsables,
 * categorías) y conviene poder filtrarla por texto en vez de solo
 * desplazarse.
 *
 * El cierre del panel se decide por clic-afuera (listener en `document`),
 * NO por `onBlur` del input — un `onBlur` cerraría el panel (desmontando
 * los botones de opción) antes de que el clic sobre una opción llegue a
 * disparar su propio `onClick`, el error clásico de este patrón.
 */
export function SelectorBuscable({
  grupos, valor, etiquetaSeleccionada, alSeleccionar, placeholder = 'Buscar…', testId, deshabilitado
}: {
  grupos: GrupoSelectorBuscable[];
  valor: string;
  etiquetaSeleccionada: string;
  alSeleccionar: (value: string) => void;
  placeholder?: string;
  testId: string;
  deshabilitado?: boolean;
}): React.JSX.Element {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alClicFuera = (e: MouseEvent): void => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alClicFuera);
    return () => document.removeEventListener('mousedown', alClicFuera);
  }, [abierto]);

  const filtro = texto.trim().toLowerCase();
  const gruposFiltrados = grupos
    .map((g) => ({ ...g, opciones: filtro ? g.opciones.filter((o) => o.etiqueta.toLowerCase().includes(filtro)) : g.opciones }))
    .filter((g) => g.opciones.length > 0);
  const primeraOpcion = gruposFiltrados[0]?.opciones[0];

  const seleccionar = (v: string): void => {
    alSeleccionar(v);
    setAbierto(false);
    setTexto('');
  };

  return (
    <div className="selector-buscable" ref={contenedor} style={{ position: 'relative' }}>
      <input
        type="text"
        value={abierto ? texto : etiquetaSeleccionada}
        placeholder={placeholder}
        disabled={deshabilitado}
        onFocus={(e) => {
          setAbierto(true);
          setTexto('');
          e.target.select();
        }}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setAbierto(false);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Enter' && primeraOpcion) {
            e.preventDefault();
            seleccionar(primeraOpcion.value);
          }
        }}
        data-testid={testId}
      />
      {abierto && (
        <div
          className="tarjeta"
          style={{
            position: 'absolute', left: 0, top: '100%', zIndex: 30, minWidth: '100%', maxHeight: 260,
            overflowY: 'auto', padding: 6, marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
          }}
          data-testid={`${testId}-panel`}
        >
          {gruposFiltrados.length === 0 && <div className="texto-suave" style={{ padding: '6px 8px' }}>Sin resultados</div>}
          {gruposFiltrados.map((g, gi) => (
            <div key={g.etiqueta ?? `grupo-${gi}`}>
              {g.etiqueta && (
                <div className="texto-suave" style={{ padding: '4px 8px', fontSize: 11, fontWeight: 600 }}>{g.etiqueta}</div>
              )}
              {g.opciones.map((o) => (
                <button
                  type="button"
                  key={o.value}
                  className="selector-buscable-opcion"
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px',
                    paddingLeft: 8 + (o.nivel ?? 0) * 14,
                    background: o.value === valor ? 'var(--primario-suave)' : 'transparent',
                    border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13
                  }}
                  onClick={() => seleccionar(o.value)}
                  data-testid={`${testId}-opcion-${o.etiqueta}`}
                >
                  {o.nivel ? <span className="conector-jerarquia">└</span> : null}
                  {o.etiqueta}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
