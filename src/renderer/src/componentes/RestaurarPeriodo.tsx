import { useState } from 'react';
import { invocar } from '../api';
import { Icono } from './Icono';

/**
 * Restaura TODAS las desagregaciones de un período a un punto en el tiempo
 * (Batch X, X5) — mismo patrón visual e interacción que `HistorialCelda`
 * (ícono + panel flotante con una lista de puntos y un botón "Restaurar"
 * por fila, cargada perezosamente al abrir), en vez del `datetime-local`
 * de antes.
 *
 * Los puntos son reales, no un texto libre: la UNIÓN del historial de
 * TODAS las desagregaciones (`recoleccion:historial` por clave, la misma
 * consulta que ya usa `HistorialCelda` por celda) — nunca el valor vigente
 * en sí (restaurar "a ahora" no tendría efecto), solo versiones ya
 * superadas, exactamente como el propio `HistorialCelda` nunca lista la
 * versión actual como algo a lo que "volver".
 */
export function RestaurarPeriodo({
  indicadorId, periodoId, clavesDesagregacion, alRestaurar
}: {
  indicadorId: string;
  periodoId: string;
  clavesDesagregacion: string[];
  alRestaurar: (timestampIso: string) => Promise<number>;
}): React.JSX.Element {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [puntos, setPuntos] = useState<string[] | null>(null);
  const [restaurando, setRestaurando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const abrir = async (): Promise<void> => {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setAbierto(true);
    setCargando(true);
    try {
      const timestamps = new Set<string>();
      const historiales = await Promise.all(
        clavesDesagregacion.map((clave) => invocar('recoleccion:historial', { indicadorId, periodoId, claveDesagregacion: clave }))
      );
      for (const historial of historiales) for (const h of historial) timestamps.add(h.actualizadoEn);
      setPuntos([...timestamps].sort().reverse());
    } finally {
      setCargando(false);
    }
  };

  const restaurar = async (timestamp: string): Promise<void> => {
    setRestaurando(true);
    setMensaje(null);
    try {
      const cantidad = await alRestaurar(timestamp);
      setMensaje(
        cantidad === 0
          ? 'Ninguna celda cambió: ya coincidían con el estado de ese momento.'
          : `${cantidad} celda(s) restaurada(s) al estado vigente en ese momento.`
      );
    } catch (error) {
      setMensaje((error as Error).message);
    } finally {
      setRestaurando(false);
    }
  };

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="boton sutil"
        title="Restaurar período a un punto en el tiempo"
        onClick={() => void abrir()}
        disabled={clavesDesagregacion.length === 0}
        data-testid="abrir-restaurar-periodo"
      >
        <Icono nombre="historial" tamano={13} /> Restaurar período…
      </button>
      {abierto && (
        <div
          className="tarjeta"
          style={{
            position: 'absolute', left: 0, top: '100%', zIndex: 20, minWidth: 300, maxHeight: 280,
            overflowY: 'auto', padding: 10, marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
          }}
          data-testid="panel-restaurar-periodo"
        >
          <p className="texto-suave" style={{ margin: '0 0 8px', fontSize: 11 }}>
            Restaura TODAS las desagregaciones de este período al estado vigente en ese momento.
          </p>
          {cargando && <p className="texto-suave" style={{ margin: 0 }}>Cargando…</p>}
          {!cargando && puntos?.length === 0 && (
            <p className="texto-suave" style={{ margin: 0 }}>Sin puntos anteriores en este período.</p>
          )}
          {!cargando && puntos && puntos.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              {puntos.map((t) => (
                <div key={t} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12 }}>{new Date(t).toLocaleString('es')}</div>
                  <button
                    className="boton sutil"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    disabled={restaurando}
                    onClick={() => void restaurar(t)}
                    data-testid={`restaurar-periodo-${t}`}
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
          {mensaje && (
            <div className="aviso info" style={{ marginTop: 8, fontSize: 12 }} data-testid="aviso-restaurar-periodo">
              {mensaje}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
