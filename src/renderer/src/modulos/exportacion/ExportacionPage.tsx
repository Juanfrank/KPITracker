import { useEffect, useState } from 'react';
import { invocar } from '../../api';
import { Encabezado } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

/**
 * Exportación analítica: la capa desnormalizada se regenera automáticamente
 * con cada modificación; aquí puede forzarse y consultarse su ubicación
 * para conectarla a Power BI.
 */
export function ExportacionPage(): React.JSX.Element {
  const [ruta, setRuta] = useState('');
  const [estado, setEstado] = useState<'inactivo' | 'generando' | 'listo' | 'error'>('inactivo');

  useEffect(() => {
    void invocar('exportacion:ruta', undefined).then((r) => setRuta(r.ruta));
  }, []);

  const regenerar = async (): Promise<void> => {
    setEstado('generando');
    try {
      const r = await invocar('exportacion:regenerar', undefined);
      setRuta(r.ruta);
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  };

  return (
    <>
      <Encabezado
        titulo="Exportación Analítica"
        descripcion="Capa desnormalizada para Power BI, Excel y otras herramientas. Cada fila es un resultado con los atributos del indicador y las desagregaciones expandidas como columnas."
        acciones={
          <button className="boton primario" onClick={() => void regenerar()} disabled={estado === 'generando'} data-testid="regenerar-export">
            <Icono nombre="exportar" /> {estado === 'generando' ? 'Generando…' : 'Regenerar ahora'}
          </button>
        }
      />
      {estado === 'listo' && <div className="aviso exito">Exportación regenerada correctamente.</div>}
      {estado === 'error' && <div className="aviso error">Ocurrió un error al regenerar la exportación.</div>}

      <div className="tarjeta">
        <h3 style={{ marginTop: 0 }}>Ubicación de los archivos</h3>
        <p>
          Archivo principal: <span className="mono">{ruta ? `${ruta}/ResultadosAnalitico.parquet` : '…'}</span>
        </p>
        <p className="texto-suave">
          Si activó la opción CSV en Configuración General, también se genera <span className="mono">ResultadosAnalitico.csv</span> (UTF-8).
          Las dimensiones del modelo estrella están en <span className="mono">Data/Dimensions</span>.
        </p>
      </div>

      <div className="tarjeta">
        <h3 style={{ marginTop: 0 }}>Conexión desde Power BI</h3>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>En Power BI Desktop: <strong>Obtener datos → Parquet</strong>.</li>
          <li>Seleccione <span className="mono">ResultadosAnalitico.parquet</span> de la carpeta indicada arriba.</li>
          <li>No se requieren relaciones: la tabla ya está desnormalizada (una fila por resultado).</li>
          <li>Al actualizar el informe, Power BI leerá siempre la versión sincronizada más reciente.</li>
        </ol>
        <p className="texto-suave" style={{ marginBottom: 0 }}>
          La sincronización es automática: cada resultado guardado programa una regeneración inmediata de esta capa.
        </p>
      </div>
    </>
  );
}
