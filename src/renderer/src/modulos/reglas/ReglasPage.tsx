import { useCallback, useEffect, useState } from 'react';
import type { Atributo, ElementoLista, ReglaNegocio } from '@domain/index';
import { explicarCondicion } from '@domain/index';
import { invocar } from '../../api';
import { tipos } from '../../dominio';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';
import type { AtributoDisponible } from '../../componentes/EditorCondicion';
import { EditorCondicion } from '../../componentes/EditorCondicion';

const CAMPOS_FIJOS_INDICADOR: AtributoDisponible[] = [
  { nombre: 'Nombre' }, { nombre: 'Definicion' }, { nombre: 'Periodicidad' }, { nombre: 'LineaBase' },
  { nombre: 'MetaGlobal' }, { nombre: 'Estado' }, { nombre: 'UnidadMedida' }, { nombre: 'Responsable' }, { nombre: 'Categoria' }
];
const CAMPOS_AGREGADOS_CAPTURA: AtributoDisponible[] = [
  'General', 'Maximo', 'Minimo', 'Suma', 'Promedio', 'CantidadConValor', 'TotalCombinaciones'
].map((nombre) => ({ nombre }));

function reglaVacia(): ReglaNegocio {
  return {
    id: '',
    nombre: '',
    descripcion: '',
    tipo: 'Obligatoriedad',
    entidad: 'Indicador',
    atributoObjetivoId: null,
    condicion: { op: 'eq', args: [{ attr: '' }, { literal: '' }] },
    mensajeError: null,
    activa: true,
    creadoEn: '',
    actualizadoEn: ''
  };
}

/**
 * Reglas de negocio declarativas (motor de reglas): constructor visual del
 * AST (con condiciones anidadas Y/O/NO), y un modo avanzado con edición
 * directa del JSON como alternativa sincronizada. Cubre reglas sobre
 * Indicador (visibilidad/obligatoriedad de atributos, validación cruzada
 * entre campos) y sobre Recoleccion (validación cruzada de agregados del
 * levantamiento: General, Máximo, Mínimo, Suma, Promedio...).
 */
export function ReglasPage(): React.JSX.Element {
  const [reglas, setReglas] = useState<ReglaNegocio[]>([]);
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [elementosPorLista, setElementosPorLista] = useState<Map<string, ElementoLista[]>>(new Map());
  const [editando, setEditando] = useState<ReglaNegocio | null>(null);
  const [modoAvanzado, setModoAvanzado] = useState(false);
  const [jsonAvanzado, setJsonAvanzado] = useState('');
  const [errorJson, setErrorJson] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    const [reglasIndicador, reglasRecoleccion] = await Promise.all([
      invocar('reglas:listar', { entidad: 'Indicador' }),
      invocar('reglas:listar', { entidad: 'Recoleccion' })
    ]);
    setReglas([...reglasIndicador, ...reglasRecoleccion]);
  }, []);

  useEffect(() => {
    void cargar();
    void invocar('atributos:listar', { entidad: 'Indicador' }).then(setAtributos);
  }, [cargar]);

  useEffect(() => {
    const idsListas = [...new Set(atributos.filter((a) => a.listaId).map((a) => a.listaId as string))];
    const pendientes = idsListas.filter((id) => !elementosPorLista.has(id));
    if (pendientes.length === 0) return;
    void Promise.all(pendientes.map((id) => invocar('listas:elementos', { listaId: id }).then((els) => [id, els] as const))).then(
      (pares) => setElementosPorLista((previo) => new Map([...previo, ...pares]))
    );
  }, [atributos, elementosPorLista]);

  const abrir = (regla: ReglaNegocio): void => {
    setEditando(regla);
    setModoAvanzado(false);
    setJsonAvanzado(JSON.stringify(regla.condicion, null, 2));
    setErrorJson(null);
  };

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    let condicion = editando.condicion;
    if (modoAvanzado) {
      try {
        condicion = JSON.parse(jsonAvanzado) as ReglaNegocio['condicion'];
      } catch {
        setErrorJson('El JSON de la condición no es válido.');
        return;
      }
    }
    await invocar('reglas:guardar', { ...editando, condicion });
    setEditando(null);
    await cargar();
  };

  const cambiarEntidad = (entidad: string): void => {
    if (!editando) return;
    setEditando(
      entidad === 'Recoleccion'
        ? { ...editando, entidad, tipo: 'ValidacionCruzada', atributoObjetivoId: null }
        : { ...editando, entidad }
    );
  };

  const nombresAtributos: AtributoDisponible[] = editando?.entidad === 'Recoleccion'
    ? CAMPOS_AGREGADOS_CAPTURA
    : [...CAMPOS_FIJOS_INDICADOR, ...atributos.map((a) => ({ nombre: a.nombre, tipoDato: a.tipoDato, listaId: a.listaId }))];

  return (
    <>
      <Encabezado
        titulo="Reglas de Negocio"
        descripcion="Reglas condicionales declarativas: visibilidad, obligatoriedad y validaciones cruzadas. Se evalúan con el motor de reglas, sin lógica codificada."
        acciones={
          <button className="boton primario" onClick={() => abrir(reglaVacia())} data-testid="nueva-regla">
            <Icono nombre="mas" /> Nueva regla
          </button>
        }
      />
      <div className="tabla-envoltura">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Entidad</th>
              <th>Tipo</th>
              <th>Condición</th>
              <th>Activa</th>
            </tr>
          </thead>
          <tbody>
            {reglas.map((r) => (
              <tr key={r.id} onClick={() => abrir(r)} style={{ cursor: 'pointer' }} data-testid={`regla-${r.nombre}`}>
                <td><strong>{r.nombre}</strong></td>
                <td>{r.entidad}</td>
                <td>{r.tipo}</td>
                <td>{explicarCondicion(r.condicion)}</td>
                <td>{r.activa ? 'Sí' : 'No'}</td>
              </tr>
            ))}
            {reglas.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <Vacio
                    icono="✓"
                    mensaje="Sin reglas condicionales"
                    detalle='Ejemplos: "Obligatorio si Monto es mayor que 5000", "General es menor que Maximo".'
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editando && (
        <PanelLateral
          titulo={editando.id ? 'Editar regla' : 'Nueva regla'}
          alCerrar={() => setEditando(null)}
          pie={
            <>
              {editando.id && (
                <button
                  className="boton peligro"
                  onClick={() => {
                    void invocar('reglas:eliminar', { id: editando.id }).then(() => {
                      setEditando(null);
                      void cargar();
                    });
                  }}
                >
                  Eliminar
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-regla">Guardar</button>
            </>
          }
        >
          <Campo etiqueta="Nombre" obligatorio>
            <input type="text" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} autoFocus data-testid="regla-nombre" />
          </Campo>
          <div className="fila-form c2">
            <Campo etiqueta="Se aplica sobre">
              <select value={editando.entidad} onChange={(e) => cambiarEntidad(e.target.value)}>
                <option value="Indicador">Indicador (atributos del formulario)</option>
                <option value="Recoleccion">Recolección (agregados del levantamiento)</option>
              </select>
            </Campo>
            <Campo etiqueta="Tipo de regla">
              <select
                value={editando.tipo}
                disabled={editando.entidad === 'Recoleccion'}
                onChange={(e) => setEditando({ ...editando, tipo: e.target.value as ReglaNegocio['tipo'] })}
                data-testid="regla-tipo"
              >
                <option value="Visibilidad">Visibilidad (mostrar si…)</option>
                <option value="Obligatoriedad">Obligatoriedad (obligatorio si…)</option>
                <option value="ValidacionCruzada">Validación cruzada (debe cumplirse…)</option>
              </select>
            </Campo>
          </div>
          {editando.entidad === 'Indicador' && editando.tipo !== 'ValidacionCruzada' && (
            <Campo etiqueta="Atributo objetivo" obligatorio>
              <select
                value={editando.atributoObjetivoId ?? ''}
                onChange={(e) => setEditando({ ...editando, atributoObjetivoId: e.target.value || null })}
              >
                <option value="">— ninguno —</option>
                {atributos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Descripción">
            <textarea rows={2} value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} />
          </Campo>

          <div className="toolbar">
            <h4 style={{ margin: 0 }}>Condición</h4>
            <div className="separador" />
            <button className="boton sutil" onClick={() => setModoAvanzado((v) => !v)}>
              {modoAvanzado ? 'Constructor visual' : 'Editor avanzado (JSON)'}
            </button>
          </div>

          {!modoAvanzado ? (
            <EditorCondicion
              condicion={editando.condicion}
              atributosDisponibles={nombresAtributos}
              alCambiar={(condicion) => setEditando({ ...editando, condicion })}
              tipos={tipos}
              elementosPorLista={elementosPorLista}
            />
          ) : (
            <Campo etiqueta="Condición (AST JSON)" error={errorJson}>
              <textarea
                rows={8}
                className="mono"
                value={jsonAvanzado}
                onChange={(e) => {
                  setJsonAvanzado(e.target.value);
                  setErrorJson(null);
                }}
              />
              <span className="texto-suave">
                Operadores: eq, ne, gt, gte, lt, lte, between, contains, matches, isEmpty, notEmpty, and, or, not.
              </span>
            </Campo>
          )}

          {editando.tipo === 'ValidacionCruzada' && (
            <Campo etiqueta="Mensaje de error">
              <input
                type="text"
                value={editando.mensajeError ?? ''}
                placeholder="Ej.: La fecha final debe ser mayor que la fecha de inicio"
                onChange={(e) => setEditando({ ...editando, mensajeError: e.target.value || null })}
              />
            </Campo>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={editando.activa}
              onChange={(e) => setEditando({ ...editando, activa: e.target.checked })}
              style={{ width: 'auto' }}
            />
            Regla activa
          </label>
        </PanelLateral>
      )}
    </>
  );
}
