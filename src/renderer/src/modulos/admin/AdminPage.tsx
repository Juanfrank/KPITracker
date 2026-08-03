import { useRef, useState } from 'react';
import { invocar } from '../../api';
import { Encabezado } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

/**
 * Administración: configuración portable (export/import de TODA la
 * configuración en un único JSON versionado, preparado para migraciones).
 */
export function AdminPage(): React.JSX.Element {
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error' | 'info'; texto: string } | null>(null);
  const selectorArchivo = useRef<HTMLInputElement>(null);

  const exportar = async (): Promise<void> => {
    try {
      const { json } = await invocar('portable:exportar', undefined);
      const blob = new Blob([json], { type: 'application/json' });
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      enlace.download = `kpitracker-config-${new Date().toISOString().slice(0, 10)}.json`;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
      setMensaje({ tipo: 'exito', texto: 'Configuración exportada correctamente.' });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: (error as Error).message });
    }
  };

  const importar = async (archivo: File): Promise<void> => {
    try {
      const json = await archivo.text();
      const { advertencias } = await invocar('portable:importar', { json });
      setMensaje({
        tipo: 'exito',
        texto:
          advertencias.length > 0
            ? `Configuración importada. ${advertencias.join(' ')}`
            : 'Configuración importada correctamente.'
      });
    } catch (error) {
      setMensaje({ tipo: 'error', texto: `No se pudo importar: ${(error as Error).message}` });
    }
  };

  return (
    <>
      <Encabezado
        titulo="Administración"
        descripcion="Configuración portable y mantenimiento del sistema."
      />
      {mensaje && <div className={`aviso ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div className="tarjeta">
        <h3 style={{ marginTop: 0 }}>Configuración portable</h3>
        <p className="texto-suave">
          Exporta indicadores, atributos, listas, reglas, desagregaciones, metas y parámetros generales en un único
          archivo JSON versionado. El archivo puede importarse en otra instalación; las versiones antiguas se migran
          automáticamente.
        </p>
        <div className="toolbar">
          <button className="boton primario" onClick={() => void exportar()} data-testid="exportar-config">
            <Icono nombre="exportar" /> Exportar configuración
          </button>
          <button className="boton" onClick={() => selectorArchivo.current?.click()} data-testid="importar-config">
            Importar configuración…
          </button>
          <input
            ref={selectorArchivo}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) void importar(archivo);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="tarjeta">
        <h3 style={{ marginTop: 0 }}>Usuarios y responsables</h3>
        <p className="texto-suave" style={{ marginBottom: 0 }}>
          Esta versión opera con un único usuario local. La arquitectura ya contempla usuarios, responsables por
          indicador, aprobadores y flujos de revisión; se habilitarán en versiones futuras (ver roadmap en la
          documentación).
        </p>
      </div>
    </>
  );
}
