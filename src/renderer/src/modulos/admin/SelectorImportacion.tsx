import { useRef, useState } from 'react';
import type { CategoriaResumen, ResultadoImportacionRespaldo, ResumenRespaldo } from '@infrastructure/perfiles/esquemaRespaldo';
import { subirArchivo } from '../../rest';
import { PanelLateral } from '../../componentes/basicos';
import {
  alternarCategoria, alternarItem, aSeleccionIpc, contarSeleccionados, estadoDeCategoria, seleccionInicial,
  seleccionarTodosItems
} from './modeloSeleccion';
import type { EstadoSeleccion } from './modeloSeleccion';

/**
 * Checkbox tri-estado de una categoría: `indeterminate` no es una prop de
 * React, se fija imperativamente vía ref.
 */
function CheckboxCategoria({
  categoria, estado, alCambiar
}: {
  categoria: CategoriaResumen;
  estado: EstadoSeleccion;
  alCambiar: (marcado: boolean) => void;
}): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null);
  const estadoCat = estadoDeCategoria(estado, categoria);
  if (ref.current) ref.current.indeterminate = estadoCat === 'parcial';
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={estadoCat !== 'ninguno'}
      onChange={(e) => alCambiar(e.target.checked)}
      style={{ width: 'auto' }}
      data-testid={`respaldo-categoria-${categoria.categoria}`}
    />
  );
}

function PanelItems({
  categoria, estado, setEstado, alCerrar
}: {
  categoria: CategoriaResumen;
  estado: EstadoSeleccion;
  setEstado: (e: EstadoSeleccion) => void;
  alCerrar: () => void;
}): React.JSX.Element {
  const seleccionados = new Set(
    estado[categoria.categoria] === 'todos' ? categoria.items.map((i) => i.id) : estado[categoria.categoria]
  );
  return (
    <PanelLateral
      titulo={`${categoria.etiqueta} — ítems`}
      alCerrar={alCerrar}
      pie={
        <>
          <button className="boton sutil" onClick={() => setEstado(seleccionarTodosItems(estado, categoria, false))}>
            Deseleccionar todo
          </button>
          <button className="boton sutil" onClick={() => setEstado(seleccionarTodosItems(estado, categoria, true))}>
            Seleccionar todo
          </button>
          <span style={{ flex: 1 }} />
          <button className="boton primario" onClick={alCerrar}>Listo</button>
        </>
      }
    >
      {categoria.categoria === 'listas' && (
        <p className="texto-suave">Los elementos de cada lista se importan automáticamente junto con ella.</p>
      )}
      {categoria.items.map((item) => (
        <label key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', padding: '4px 0' }}>
          <input
            type="checkbox"
            checked={seleccionados.has(item.id)}
            onChange={(e) => setEstado(alternarItem(estado, categoria, item.id, e.target.checked))}
            style={{ width: 'auto' }}
            data-testid={`respaldo-item-${item.id}`}
          />
          <span>
            {item.nombre}
            {item.detalle && <span className="texto-suave"> — {item.detalle}</span>}
          </span>
        </label>
      ))}
      {categoria.items.length === 0 && <p className="texto-suave">Sin ítems en esta categoría.</p>}
    </PanelLateral>
  );
}

/**
 * Selector de importación granular (Batch N/P): usa exclusivamente las
 * funciones puras de `modeloSeleccion.ts` — cero lógica de selección
 * inline. Checkbox tri-estado por categoría + panel de ítems puntuales
 * ("Editar") para incluir solo algunos.
 *
 * Recibe el `File` ya elegido por el usuario (no una ruta de servidor — ver
 * plan Fase 4 §9.4): `importar()` lo vuelve a subir junto con la selección
 * a `POST /api/respaldo/importar`, ya que el servidor no retiene el archivo
 * entre la llamada de preview (`/api/respaldo/leer`) y la de importación.
 */
export function SelectorImportacion({
  archivo, resumen, alCerrar
}: {
  archivo: File;
  resumen: ResumenRespaldo;
  alCerrar: () => void;
}): React.JSX.Element {
  const [estado, setEstado] = useState<EstadoSeleccion>(() => seleccionInicial(resumen));
  const [categoriaEditando, setCategoriaEditando] = useState<CategoriaResumen | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacionRespaldo | null>(null);
  const [importando, setImportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seleccion = aSeleccionIpc(estado);
  const nadaSeleccionado = Object.keys(seleccion).length === 0;

  const importar = async (): Promise<void> => {
    setImportando(true);
    setError(null);
    try {
      setResultado(
        await subirArchivo<ResultadoImportacionRespaldo>('/api/respaldo/importar', { archivo, seleccion: JSON.stringify(seleccion) })
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImportando(false);
    }
  };

  if (resultado) {
    const totalImportado = Object.values(resultado.importados).reduce((a, b) => a + b, 0);
    return (
      <PanelLateral
        titulo="Importación completa"
        alCerrar={alCerrar}
        pie={
          <button className="boton primario" onClick={() => window.location.reload()} data-testid="recargar-tras-importar">
            Recargar
          </button>
        }
      >
        <div className="aviso exito" data-testid="respaldo-resultado">
          {totalImportado} ítem{totalImportado === 1 ? '' : 's'} importado{totalImportado === 1 ? '' : 's'}.
        </div>
        {resultado.advertencias.length > 0 && (
          <div className="aviso info">
            {resultado.advertencias.map((a) => <div key={a}>{a}</div>)}
          </div>
        )}
        <p className="texto-suave">El resto de las páginas puede tener datos desactualizados hasta recargar.</p>
      </PanelLateral>
    );
  }

  return (
    <>
      <PanelLateral
        titulo="Importar respaldo"
        alCerrar={alCerrar}
        pie={
          <button className="boton primario" disabled={nadaSeleccionado || importando} onClick={() => void importar()} data-testid="confirmar-importar-respaldo">
            {importando ? 'Importando…' : 'Importar'}
          </button>
        }
      >
        {error && <div className="aviso error">{error}</div>}
        <p className="texto-suave">
          Respaldo del {resumen.exportadoEn.slice(0, 10)}{resumen.appVersion ? ` — versión ${resumen.appVersion}` : ''}.
        </p>
        {resumen.categorias.map((categoria) => (
          <div key={categoria.categoria} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--borde)' }}>
            <CheckboxCategoria
              categoria={categoria}
              estado={estado}
              alCambiar={(marcado) => setEstado(alternarCategoria(estado, categoria.categoria, marcado))}
            />
            <span style={{ flex: 1 }}>
              {categoria.etiqueta}
              {!categoria.atomica && (
                <span className="texto-suave"> ({contarSeleccionados(estado, categoria)} de {categoria.total})</span>
              )}
            </span>
            {!categoria.atomica && categoria.total > 0 && (
              <button className="boton sutil" onClick={() => setCategoriaEditando(categoria)} data-testid={`respaldo-editar-${categoria.categoria}`}>
                Editar
              </button>
            )}
          </div>
        ))}
      </PanelLateral>
      {categoriaEditando && (
        <PanelItems categoria={categoriaEditando} estado={estado} setEstado={setEstado} alCerrar={() => setCategoriaEditando(null)} />
      )}
    </>
  );
}
