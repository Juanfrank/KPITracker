import { useState } from 'react';
import type { ResumenRespaldo } from '@infrastructure/perfiles/esquemaRespaldo';
import { invocar } from '../../api';
import { SelectorImportacion } from './SelectorImportacion';

/**
 * Respaldo/importación de perfil (Batch N/P): siempre opera sobre el
 * perfil ACTIVO — para respaldar o importar en otro perfil hay que
 * cambiarse a él primero. El diálogo nativo de archivo no es
 * automatizable en E2E; ese flujo se cubre por integración
 * (`tests/integration/respaldo.test.ts`).
 */
export function TarjetaRespaldo({ nombrePerfilActivo }: { nombrePerfilActivo: string }): React.JSX.Element {
  const [exportando, setExportando] = useState(false);
  const [mensajeExport, setMensajeExport] = useState<string | null>(null);
  const [seleccionActiva, setSeleccionActiva] = useState<{ ruta: string; resumen: ResumenRespaldo } | null>(null);
  const [cargandoSeleccion, setCargandoSeleccion] = useState(false);
  const [errorSeleccion, setErrorSeleccion] = useState<string | null>(null);

  const exportar = async (): Promise<void> => {
    setExportando(true);
    setMensajeExport(null);
    try {
      const { ruta } = await invocar('respaldo:exportar', undefined);
      setMensajeExport(ruta ? `Respaldo guardado en ${ruta}` : null);
    } catch (e) {
      setMensajeExport(null);
      setErrorSeleccion((e as Error).message);
    } finally {
      setExportando(false);
    }
  };

  const seleccionarArchivo = async (): Promise<void> => {
    setCargandoSeleccion(true);
    setErrorSeleccion(null);
    try {
      const resultado = await invocar('respaldo:seleccionar', undefined);
      if (resultado) setSeleccionActiva(resultado);
    } catch (e) {
      setErrorSeleccion((e as Error).message);
    } finally {
      setCargandoSeleccion(false);
    }
  };

  return (
    <div className="tarjeta" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Respaldo e importación</h3>
      <p className="texto-suave">
        El respaldo y la importación siempre operan sobre el perfil activo: <strong>{nombrePerfilActivo}</strong>. Para
        respaldar o importar en otro perfil, cámbiese a él primero.
      </p>
      {errorSeleccion && <div className="aviso error">{errorSeleccion}</div>}
      {mensajeExport && <div className="aviso exito">{mensajeExport}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="boton" onClick={() => void exportar()} disabled={exportando} data-testid="exportar-respaldo">
          {exportando ? 'Exportando…' : 'Exportar respaldo…'}
        </button>
        <button className="boton" onClick={() => void seleccionarArchivo()} disabled={cargandoSeleccion} data-testid="importar-respaldo">
          {cargandoSeleccion ? 'Leyendo…' : 'Importar respaldo…'}
        </button>
      </div>
      {seleccionActiva && (
        <SelectorImportacion ruta={seleccionActiva.ruta} resumen={seleccionActiva.resumen} alCerrar={() => setSeleccionActiva(null)} />
      )}
    </div>
  );
}
