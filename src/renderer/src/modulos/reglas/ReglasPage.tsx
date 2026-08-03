import { useCallback, useEffect, useState } from 'react';
import type { Atributo, Condicion, ReglaNegocio } from '@domain/index';
import { invocar } from '../../api';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

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

const OPERADORES = [
  { op: 'eq', etiqueta: 'igual a' },
  { op: 'ne', etiqueta: 'distinto de' },
  { op: 'gt', etiqueta: 'mayor que' },
  { op: 'gte', etiqueta: 'mayor o igual que' },
  { op: 'lt', etiqueta: 'menor que' },
  { op: 'lte', etiqueta: 'menor o igual que' },
  { op: 'contains', etiqueta: 'contiene' },
  { op: 'notEmpty', etiqueta: 'no está vacío' },
  { op: 'isEmpty', etiqueta: 'está vacío' }
];

interface CondicionSimple {
  atributo: string;
  op: string;
  valor: string;
  valorEsAtributo: boolean;
}

function aCondicionSimple(condicion: Condicion): CondicionSimple | null {
  if (!OPERADORES.some((o) => o.op === condicion.op)) return null;
  const [izq, der] = condicion.args;
  if (!izq || typeof izq !== 'object' || !('attr' in izq)) return null;
  const base: CondicionSimple = { atributo: izq.attr, op: condicion.op, valor: '', valorEsAtributo: false };
  if (der && typeof der === 'object') {
    if ('literal' in der) base.valor = String(der.literal ?? '');
    else if ('attr' in der) {
      base.valor = der.attr;
      base.valorEsAtributo = true;
    }
  }
  return base;
}

function deCondicionSimple(s: CondicionSimple): Condicion {
  const args: Condicion['args'] = [{ attr: s.atributo }];
  if (!['isEmpty', 'notEmpty'].includes(s.op)) {
    const numero = Number(s.valor);
    args.push(
      s.valorEsAtributo
        ? { attr: s.valor }
        : { literal: s.valor !== '' && !Number.isNaN(numero) ? numero : s.valor }
    );
  }
  return { op: s.op, args };
}

/**
 * Reglas de negocio declarativas (motor de reglas): el editor visual cubre
 * condiciones simples (atributo–operador–valor/atributo); el modo avanzado
 * permite editar el AST JSON completo con operadores anidados (and/or/not).
 */
export function ReglasPage(): React.JSX.Element {
  const [reglas, setReglas] = useState<ReglaNegocio[]>([]);
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [editando, setEditando] = useState<ReglaNegocio | null>(null);
  const [modoAvanzado, setModoAvanzado] = useState(false);
  const [jsonAvanzado, setJsonAvanzado] = useState('');
  const [errorJson, setErrorJson] = useState<string | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setReglas(await invocar('reglas:listar', { entidad: 'Indicador' }));
  }, []);

  useEffect(() => {
    void cargar();
    void invocar('atributos:listar', { entidad: 'Indicador' }).then(setAtributos);
  }, [cargar]);

  const abrir = (regla: ReglaNegocio): void => {
    setEditando(regla);
    const simple = aCondicionSimple(regla.condicion);
    setModoAvanzado(simple == null);
    setJsonAvanzado(JSON.stringify(regla.condicion, null, 2));
    setErrorJson(null);
  };

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    let condicion = editando.condicion;
    if (modoAvanzado) {
      try {
        condicion = JSON.parse(jsonAvanzado) as Condicion;
      } catch {
        setErrorJson('El JSON de la condición no es válido.');
        return;
      }
    }
    await invocar('reglas:guardar', { ...editando, condicion });
    setEditando(null);
    await cargar();
  };

  const simple = editando ? aCondicionSimple(editando.condicion) : null;
  const nombresAtributos = ['Estado', 'Nombre', 'Monto', ...atributos.map((a) => a.nombre)];

  return (
    <>
      <Encabezado
        titulo="Reglas de Negocio"
        descripcion="Reglas condicionales declarativas: visibilidad, obligatoriedad y validaciones cruzadas entre atributos. Se evalúan con el motor de reglas, sin lógica codificada."
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
              <th>Tipo</th>
              <th>Condición</th>
              <th>Activa</th>
            </tr>
          </thead>
          <tbody>
            {reglas.map((r) => (
              <tr key={r.id} onClick={() => abrir(r)} style={{ cursor: 'pointer' }}>
                <td><strong>{r.nombre}</strong></td>
                <td>{r.tipo}</td>
                <td className="mono">{JSON.stringify(r.condicion)}</td>
                <td>{r.activa ? 'Sí' : 'No'}</td>
              </tr>
            ))}
            {reglas.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <Vacio
                    icono="✓"
                    mensaje="Sin reglas condicionales"
                    detalle='Ejemplos: "Obligatorio si Monto > 5000", "FechaFinal mayor que FechaInicio".'
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
              <button className="boton primario" onClick={() => void guardar()}>Guardar</button>
            </>
          }
        >
          <Campo etiqueta="Nombre" obligatorio>
            <input type="text" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} autoFocus />
          </Campo>
          <div className="fila-form c2">
            <Campo etiqueta="Tipo de regla">
              <select value={editando.tipo} onChange={(e) => setEditando({ ...editando, tipo: e.target.value as ReglaNegocio['tipo'] })}>
                <option value="Visibilidad">Visibilidad (mostrar si…)</option>
                <option value="Obligatoriedad">Obligatoriedad (obligatorio si…)</option>
                <option value="ValidacionCruzada">Validación cruzada (debe cumplirse…)</option>
              </select>
            </Campo>
            <Campo etiqueta="Atributo objetivo">
              <select
                value={editando.atributoObjetivoId ?? ''}
                onChange={(e) => setEditando({ ...editando, atributoObjetivoId: e.target.value || null })}
              >
                <option value="">— ninguno —</option>
                {atributos.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Campo>
          </div>
          <Campo etiqueta="Descripción">
            <textarea rows={2} value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} />
          </Campo>

          <div className="toolbar">
            <h4 style={{ margin: 0 }}>Condición</h4>
            <div className="separador" />
            <button className="boton sutil" onClick={() => setModoAvanzado((v) => !v)}>
              {modoAvanzado ? 'Editor simple' : 'Editor avanzado (JSON)'}
            </button>
          </div>

          {!modoAvanzado && simple ? (
            <div className="fila-form c3">
              <Campo etiqueta="Atributo">
                <input
                  type="text"
                  list="atributos-regla"
                  value={simple.atributo}
                  onChange={(e) =>
                    setEditando({ ...editando, condicion: deCondicionSimple({ ...simple, atributo: e.target.value }) })
                  }
                />
                <datalist id="atributos-regla">
                  {nombresAtributos.map((n) => <option key={n} value={n} />)}
                </datalist>
              </Campo>
              <Campo etiqueta="Operador">
                <select
                  value={simple.op}
                  onChange={(e) => setEditando({ ...editando, condicion: deCondicionSimple({ ...simple, op: e.target.value }) })}
                >
                  {OPERADORES.map((o) => <option key={o.op} value={o.op}>{o.etiqueta}</option>)}
                </select>
              </Campo>
              {!['isEmpty', 'notEmpty'].includes(simple.op) && (
                <Campo etiqueta={simple.valorEsAtributo ? 'Otro atributo' : 'Valor'}>
                  <input
                    type="text"
                    list={simple.valorEsAtributo ? 'atributos-regla' : undefined}
                    value={simple.valor}
                    onChange={(e) =>
                      setEditando({ ...editando, condicion: deCondicionSimple({ ...simple, valor: e.target.value }) })
                    }
                  />
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }} className="texto-suave">
                    <input
                      type="checkbox"
                      checked={simple.valorEsAtributo}
                      onChange={(e) =>
                        setEditando({
                          ...editando,
                          condicion: deCondicionSimple({ ...simple, valorEsAtributo: e.target.checked })
                        })
                      }
                      style={{ width: 'auto' }}
                    />
                    Comparar contra otro atributo
                  </label>
                </Campo>
              )}
            </div>
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
