import { useState } from 'react';
import type { ResultadoHistorial } from '@domain/index';
import { invocar } from '../api';
import { Icono } from './Icono';

/**
 * Ícono junto a la fecha de modificación de una celda de captura: al hacer
 * clic, consulta el historial de versiones (`recoleccion:historial`) y
 * permite restaurar una versión previa (`recoleccion:restaurarVersion`).
 * El historial es append-only: restaurar registra el estado reemplazado
 * como una nueva versión, nunca se pierde información.
 */
export function HistorialCelda({
  indicadorId, periodoId, claveDesagregacion, alRestaurar
}: {
  indicadorId: string;
  periodoId: string;
  claveDesagregacion: string;
  alRestaurar: (version: number) => Promise<void>;
}): React.JSX.Element {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [historial, setHistorial] = useState<ResultadoHistorial[] | null>(null);

  const abrir = async (): Promise<void> => {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setAbierto(true);
    setCargando(true);
    try {
      const datos = await invocar('recoleccion:historial', { indicadorId, periodoId, claveDesagregacion });
      setHistorial(datos);
    } finally {
      setCargando(false);
    }
  };

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="boton sutil"
        style={{ padding: '2px 5px' }}
        title="Ver historial de versiones"
        onClick={() => void abrir()}
        data-testid={`historial-${claveDesagregacion}`}
      >
        <Icono nombre="historial" tamano={13} />
      </button>
      {abierto && (
        <div
          className="tarjeta"
          style={{
            position: 'absolute', right: 0, top: '100%', zIndex: 20, minWidth: 260, maxHeight: 260,
            overflowY: 'auto', padding: 10, marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
          }}
        >
          {cargando && <p className="texto-suave" style={{ margin: 0 }}>Cargando…</p>}
          {!cargando && historial?.length === 0 && (
            <p className="texto-suave" style={{ margin: 0 }}>Sin versiones anteriores.</p>
          )}
          {!cargando && historial && historial.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              {historial.map((h) => (
                <div key={h.version} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div>
                    <div><strong>{h.valor ?? '—'}</strong></div>
                    <div className="texto-suave" style={{ fontSize: 11 }}>
                      v{h.version} · {new Date(h.actualizadoEn).toLocaleString('es')}
                    </div>
                  </div>
                  <button
                    className="boton sutil"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => {
                      void alRestaurar(h.version).then(() => setAbierto(false));
                    }}
                    data-testid={`restaurar-${claveDesagregacion}-v${h.version}`}
                  >
                    Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
