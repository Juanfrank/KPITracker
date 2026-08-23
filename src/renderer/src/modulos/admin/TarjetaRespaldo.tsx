import { useRef, useState } from 'react';
import type { ResumenRespaldo } from '@infrastructure/perfiles/esquemaRespaldo';
import { descargar, subirArchivo } from '../../rest';
import { SelectorImportacion } from './SelectorImportacion';

/**
 * Respaldo/importación selectiva (Batch N/P, movida fuera de `modulos/
 * perfiles/` en la Fase 4 — ver plan §9.4/§9.5): antes operaba siempre
 * sobre "el perfil activo", concepto retirado con el espacio de trabajo
 * único; ahora opera sobre los datos compartidos de la instalación. El
 * diálogo nativo de archivo (`respaldo:seleccionar`) se reemplaza por un
 * `<input type="file">` real + subida multipart a `/api/respaldo/leer`
 * (preview) y `/api/respaldo/importar` (ver `SelectorImportacion`).
 */
export function TarjetaRespaldo(): React.JSX.Element {
  const [exportando, setExportando] = useState(false);
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<{ archivo: File; resumen: ResumenRespaldo } | null>(null);
  const [cargandoSeleccion, setCargandoSeleccion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectorArchivo = useRef<HTMLInputElement>(null);

  const exportar = async (): Promise<void> => {
    setExportando(true);
    setError(null);
    try {
      await descargar('/api/respaldo/exportar', `respaldo-kpitracker-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExportando(false);
    }
  };

  const previsualizar = async (archivo: File): Promise<void> => {
    setCargandoSeleccion(true);
    setError(null);
    try {
      const resumen = await subirArchivo<ResumenRespaldo>('/api/respaldo/leer', { archivo });
      setArchivoSeleccionado({ archivo, resumen });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargandoSeleccion(false);
    }
  };

  return (
    <div className="tarjeta" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Respaldo e importación</h3>
      <p className="texto-suave">
        Exporta o importa selectivamente indicadores, atributos, listas, reglas, catálogos y demás datos compartidos.
      </p>
      {error && <div className="aviso error">{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="boton" onClick={() => void exportar()} disabled={exportando} data-testid="exportar-respaldo">
          {exportando ? 'Exportando…' : 'Exportar respaldo…'}
        </button>
        <button
          className="boton"
          onClick={() => selectorArchivo.current?.click()}
          disabled={cargandoSeleccion}
          data-testid="importar-respaldo"
        >
          {cargandoSeleccion ? 'Leyendo…' : 'Importar respaldo…'}
        </button>
        <input
          ref={selectorArchivo}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void previsualizar(archivo);
            e.target.value = '';
          }}
        />
      </div>
      {archivoSeleccionado && (
        <SelectorImportacion
          archivo={archivoSeleccionado.archivo}
          resumen={archivoSeleccionado.resumen}
          alCerrar={() => setArchivoSeleccionado(null)}
        />
      )}
    </div>
  );
}
