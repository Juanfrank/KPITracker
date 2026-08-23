import { useRef, useState } from 'react';
import type { MapeoImportacionIndicadores, ResultadoImportacionIndicadores } from '@application/use-cases/ServicioCatalogos';
import { invocar } from '../../api';
import { subirArchivo } from '../../rest';
import { Campo, PanelLateral } from '../../componentes/basicos';

const CAMPOS_OBLIGATORIOS: (keyof MapeoImportacionIndicadores)[] = ['nombre', 'definicion'];
const CAMPOS_OPCIONALES: (keyof MapeoImportacionIndicadores)[] = ['codigo', 'periodicidad', 'lineaBase', 'metaGlobal', 'unidadMedida'];
const ETIQUETA_CAMPO: Record<keyof MapeoImportacionIndicadores, string> = {
  codigo: 'Código',
  nombre: 'Nombre',
  definicion: 'Definición',
  periodicidad: 'Periodicidad',
  lineaBase: 'Línea base',
  metaGlobal: 'Meta global',
  unidadMedida: 'Unidad de medida'
};

/**
 * Importación masiva de indicadores desde un archivo Excel/CSV: el usuario
 * elige el archivo, mapea columnas del archivo a campos de Indicador y
 * confirma. Cada fila se crea de forma independiente; los errores por fila
 * se muestran sin bloquear el resto.
 */
export function ImportarExcelIndicadores({
  alCerrar, alTerminar
}: { alCerrar: () => void; alTerminar: () => void }): React.JSX.Element {
  const [paso, setPaso] = useState<'archivo' | 'mapeo' | 'resultado'>('archivo');
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [columnas, setColumnas] = useState<string[]>([]);
  const [filas, setFilas] = useState<Record<string, string>[]>([]);
  const [mapeo, setMapeo] = useState<Partial<MapeoImportacionIndicadores>>({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacionIndicadores | null>(null);
  const selectorArchivo = useRef<HTMLInputElement>(null);

  const procesarArchivo = async (archivo: File): Promise<void> => {
    setError(null);
    setCargando(true);
    try {
      const leido = await subirArchivo<{ columnas: string[]; filas: Record<string, string>[] }>(
        '/api/importacion/hoja-calculo',
        { archivo }
      );
      if (leido.columnas.length === 0) {
        setError('El archivo no tiene columnas reconocibles en la primera fila.');
        return;
      }
      setNombreArchivo(archivo.name);
      setColumnas(leido.columnas);
      setFilas(leido.filas);
      // Auto-mapeo por coincidencia de nombre (insensible a mayúsculas).
      const auto: Partial<MapeoImportacionIndicadores> = {};
      for (const campo of [...CAMPOS_OBLIGATORIOS, ...CAMPOS_OPCIONALES]) {
        const coincidencia = leido.columnas.find((c) => c.toLowerCase() === ETIQUETA_CAMPO[campo].toLowerCase() || c.toLowerCase() === campo.toLowerCase());
        if (coincidencia) auto[campo] = coincidencia;
      }
      setMapeo(auto);
      setPaso('mapeo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    } finally {
      setCargando(false);
    }
  };

  const confirmarImportacion = async (): Promise<void> => {
    if (!mapeo.nombre || !mapeo.definicion) {
      setError('Debe mapear al menos Nombre y Definición.');
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const res = await invocar('indicadores:importarExcel', { filas, mapeo: mapeo as MapeoImportacionIndicadores });
      setResultado(res);
      setPaso('resultado');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <PanelLateral
      titulo="Importar indicadores desde Excel"
      alCerrar={paso === 'resultado' ? alTerminar : alCerrar}
      pie={
        paso === 'mapeo' ? (
          <>
            <span style={{ flex: 1 }} />
            <button className="boton" onClick={alCerrar}>Cancelar</button>
            <button className="boton primario" onClick={() => void confirmarImportacion()} disabled={cargando} data-testid="confirmar-importacion">
              {cargando ? 'Importando…' : `Importar ${filas.length} fila(s)`}
            </button>
          </>
        ) : paso === 'resultado' ? (
          <>
            <span style={{ flex: 1 }} />
            <button className="boton primario" onClick={alTerminar}>Cerrar</button>
          </>
        ) : null
      }
    >
      {error && <div className="aviso error">{error}</div>}

      {paso === 'archivo' && (
        <>
          <p className="texto-suave">
            Seleccione un archivo Excel (.xlsx) o CSV cuya primera fila tenga encabezados de columna. En el siguiente paso podrá
            indicar qué columna corresponde a cada campo del indicador.
          </p>
          <button className="boton primario" onClick={() => selectorArchivo.current?.click()} disabled={cargando} data-testid="elegir-archivo-excel">
            {cargando ? 'Leyendo…' : 'Elegir archivo…'}
          </button>
          <input
            ref={selectorArchivo}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) void procesarArchivo(archivo);
              e.target.value = '';
            }}
          />
        </>
      )}

      {paso === 'mapeo' && (
        <>
          <p className="texto-suave">
            Archivo: <strong>{nombreArchivo}</strong> — {filas.length} fila(s) de datos, {columnas.length} columna(s).
          </p>
          {[...CAMPOS_OBLIGATORIOS, ...CAMPOS_OPCIONALES].map((campo) => (
            <Campo key={campo} etiqueta={ETIQUETA_CAMPO[campo]} obligatorio={CAMPOS_OBLIGATORIOS.includes(campo)}>
              <select
                value={mapeo[campo] ?? ''}
                onChange={(e) => setMapeo({ ...mapeo, [campo]: e.target.value || undefined })}
                data-testid={`mapeo-${campo}`}
              >
                <option value="">— no mapear —</option>
                {columnas.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Campo>
          ))}
          <p className="texto-suave">
            Los indicadores importados quedan en estado <strong>Borrador</strong> y sin desagregaciones; edítelos luego para
            completar la configuración.
          </p>
        </>
      )}

      {paso === 'resultado' && resultado && (
        <>
          <p>
            <strong>{resultado.creados}</strong> indicador(es) creado(s) correctamente.
          </p>
          {resultado.errores.length > 0 && (
            <>
              <p className="texto-suave">{resultado.errores.length} fila(s) con error:</p>
              <div className="aviso error" style={{ display: 'grid', gap: 4 }}>
                {resultado.errores.map((e) => (
                  <div key={e.fila}>Fila {e.fila}: {e.mensaje}</div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </PanelLateral>
  );
}
