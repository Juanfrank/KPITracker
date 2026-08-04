import { useCallback, useEffect, useState } from 'react';
import type { Atributo, Lista, ValidacionAtributo } from '@domain/index';
import { TipoDato } from '@domain/index';
import { invocar } from '../../api';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

function atributoVacio(): Atributo {
  return {
    id: '',
    entidad: 'Indicador',
    nombre: '',
    descripcion: '',
    grupo: 'General',
    orden: 0,
    visible: true,
    editable: true,
    obligatorio: false,
    valorPorDefecto: null,
    tipoDato: TipoDato.ShortText,
    listaId: null,
    validaciones: [],
    condicionVisibilidad: null,
    condicionObligatorio: null,
    filtrable: false,
    activo: true,
    creadoEn: '',
    actualizadoEn: ''
  };
}

const VALIDACIONES_DISPONIBLES: Array<{ tipo: ValidacionAtributo['tipo']; etiqueta: string; conValor: 'numero' | 'fecha' | 'texto' | null }> = [
  { tipo: 'Obligatorio', etiqueta: 'Obligatorio', conValor: null },
  { tipo: 'LongitudMinima', etiqueta: 'Longitud mínima', conValor: 'numero' },
  { tipo: 'LongitudMaxima', etiqueta: 'Longitud máxima', conValor: 'numero' },
  { tipo: 'ValorMinimo', etiqueta: 'Valor mínimo', conValor: 'numero' },
  { tipo: 'ValorMaximo', etiqueta: 'Valor máximo', conValor: 'numero' },
  { tipo: 'FechaMinima', etiqueta: 'Fecha mínima', conValor: 'fecha' },
  { tipo: 'FechaMaxima', etiqueta: 'Fecha máxima', conValor: 'fecha' },
  { tipo: 'ExpresionRegular', etiqueta: 'Expresión regular', conValor: 'texto' },
  { tipo: 'ValorUnico', etiqueta: 'Valor único', conValor: null }
];

/**
 * Configuración de Atributos dinámicos: crear, modificar, eliminar,
 * reordenar, agrupar, ocultar y marcar obligatorios. Cada atributo define
 * tipo de dato, validaciones y (opcionalmente) reglas condicionales.
 */
export function AtributosPage(): React.JSX.Element {
  const [atributos, setAtributos] = useState<Atributo[]>([]);
  const [tipos, setTipos] = useState<Array<{ tipo: string; etiqueta: string }>>([]);
  const [listas, setListas] = useState<Lista[]>([]);
  const [editando, setEditando] = useState<Atributo | null>(null);

  const cargar = useCallback(async (): Promise<void> => {
    setAtributos(await invocar('atributos:listar', { entidad: 'Indicador' }));
  }, []);

  useEffect(() => {
    void cargar();
    void invocar('tipos:listar', undefined).then(setTipos);
    void invocar('listas:listar', undefined).then(setListas);
  }, [cargar]);

  const guardar = async (): Promise<void> => {
    if (!editando) return;
    await invocar('atributos:guardar', editando);
    setEditando(null);
    await cargar();
  };

  const mover = async (atributo: Atributo, direccion: -1 | 1): Promise<void> => {
    const delGrupo = atributos.filter((a) => a.grupo === atributo.grupo).sort((a, b) => a.orden - b.orden);
    const idx = delGrupo.findIndex((a) => a.id === atributo.id);
    const otro = delGrupo[idx + direccion];
    if (!otro) return;
    await invocar('atributos:guardar', { ...atributo, orden: otro.orden });
    await invocar('atributos:guardar', { ...otro, orden: atributo.orden });
    await cargar();
  };

  const grupos = [...new Set(atributos.map((a) => a.grupo))];
  const esTipoLista = editando?.tipoDato === TipoDato.SelectionList || editando?.tipoDato === TipoDato.MultiSelectionList;

  return (
    <>
      <Encabezado
        titulo="Configuración de Atributos"
        descripcion="Atributos dinámicos de los indicadores: no están fijos en el código. Pueden crearse, agruparse, reordenarse, ocultarse y validarse."
        acciones={
          <button className="boton primario" onClick={() => setEditando({ ...atributoVacio(), orden: atributos.length + 1 })} data-testid="nuevo-atributo">
            <Icono nombre="mas" /> Nuevo atributo
          </button>
        }
      />
      {grupos.length === 0 && (
        <Vacio icono="≣" mensaje="Aún no hay atributos dinámicos" detalle="Los atributos mínimos (nombre, definición, periodicidad, línea base, meta, desagregaciones) son fijos del sistema; aquí se agregan los adicionales." />
      )}
      {grupos.map((grupo) => (
        <div key={grupo} className="tarjeta">
          <h3 style={{ marginTop: 0 }}>{grupo}</h3>
          <div className="tabla-envoltura">
            <table className="tabla">
              <thead>
                <tr>
                  <th style={{ width: 66 }}>Orden</th>
                  <th>Nombre</th>
                  <th>Tipo de dato</th>
                  <th>Visible</th>
                  <th>Obligatorio</th>
                  <th>Validaciones</th>
                  <th style={{ width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {atributos
                  .filter((a) => a.grupo === grupo)
                  .sort((a, b) => a.orden - b.orden)
                  .map((a) => (
                    <tr key={a.id} style={{ opacity: a.activo ? 1 : 0.5 }}>
                      <td className="texto-suave">{a.orden}</td>
                      <td>
                        <strong>{a.nombre}</strong>
                        {a.descripcion && <div className="texto-suave">{a.descripcion}</div>}
                      </td>
                      <td>{tipos.find((t) => t.tipo === a.tipoDato)?.etiqueta ?? a.tipoDato}</td>
                      <td>{a.visible ? 'Sí' : 'No'}</td>
                      <td>{a.obligatorio || a.condicionObligatorio ? (a.condicionObligatorio ? 'Condicional' : 'Sí') : 'No'}</td>
                      <td className="texto-suave">{a.validaciones.length > 0 ? `${a.validaciones.length} regla(s)` : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button className="boton sutil" title="Subir" onClick={() => void mover(a, -1)}>▲</button>
                          <button className="boton sutil" title="Bajar" onClick={() => void mover(a, 1)}>▼</button>
                          <button className="boton sutil" title="Editar" onClick={() => setEditando(a)}>
                            <Icono nombre="atributo" tamano={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {editando && (
        <PanelLateral
          titulo={editando.id ? 'Editar atributo' : 'Nuevo atributo'}
          alCerrar={() => setEditando(null)}
          pie={
            <>
              {editando.id && (
                <button
                  className="boton peligro"
                  onClick={() => {
                    void invocar('atributos:eliminar', { id: editando.id }).then(() => {
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
              <button className="boton primario" onClick={() => void guardar()} data-testid="guardar-atributo">Guardar</button>
            </>
          }
        >
          <div className="fila-form c2">
            <Campo etiqueta="Nombre" obligatorio>
              <input type="text" value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} data-testid="atributo-nombre" autoFocus />
            </Campo>
            <Campo etiqueta="Grupo">
              <input type="text" value={editando.grupo} onChange={(e) => setEditando({ ...editando, grupo: e.target.value })} list="grupos-atributos" />
              <datalist id="grupos-atributos">
                {grupos.map((g) => <option key={g} value={g} />)}
              </datalist>
            </Campo>
          </div>
          <Campo etiqueta="Descripción">
            <textarea rows={2} value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} />
          </Campo>
          <div className="fila-form c2">
            <Campo etiqueta="Tipo de dato" obligatorio>
              <select value={editando.tipoDato} onChange={(e) => setEditando({ ...editando, tipoDato: e.target.value as TipoDato })} data-testid="atributo-tipo">
                {tipos.map((t) => <option key={t.tipo} value={t.tipo}>{t.etiqueta}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Orden">
              <input type="number" value={editando.orden} onChange={(e) => setEditando({ ...editando, orden: Number(e.target.value) })} />
            </Campo>
          </div>
          {esTipoLista && (
            <Campo etiqueta="Lista de selección" obligatorio>
              <select value={editando.listaId ?? ''} onChange={(e) => setEditando({ ...editando, listaId: e.target.value || null })}>
                <option value="">— seleccionar —</option>
                {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </Campo>
          )}
          <Campo etiqueta="Valor por defecto">
            <input type="text" value={editando.valorPorDefecto ?? ''} onChange={(e) => setEditando({ ...editando, valorPorDefecto: e.target.value || null })} />
          </Campo>
          <div className="fila-form c2">
            {(
              [
                ['visible', 'Visible'],
                ['editable', 'Editable'],
                ['obligatorio', 'Obligatorio'],
                ['activo', 'Activo'],
                ['filtrable', 'Usar como filtro en Seguimiento']
              ] as const
            ).map(([campo, etiqueta]) => (
              <label key={campo} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editando[campo]}
                  onChange={(e) => setEditando({ ...editando, [campo]: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                {etiqueta}
              </label>
            ))}
          </div>

          <h4 style={{ margin: '8px 0 0' }}>Validaciones</h4>
          {editando.validaciones.map((v, idx) => {
            const def = VALIDACIONES_DISPONIBLES.find((d) => d.tipo === v.tipo);
            return (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ minWidth: 150 }}>{def?.etiqueta ?? v.tipo}</span>
                {def?.conValor && (
                  <input
                    type={def.conValor === 'numero' ? 'number' : def.conValor === 'fecha' ? 'date' : 'text'}
                    value={'valor' in v ? String(v.valor) : 'patron' in v ? v.patron : ''}
                    onChange={(e) => {
                      const nuevas = [...editando.validaciones];
                      const valor = def.conValor === 'numero' ? Number(e.target.value) : e.target.value;
                      nuevas[idx] = (v.tipo === 'ExpresionRegular'
                        ? { tipo: v.tipo, patron: String(e.target.value) }
                        : { ...v, valor }) as ValidacionAtributo;
                      setEditando({ ...editando, validaciones: nuevas });
                    }}
                  />
                )}
                <button
                  className="boton sutil"
                  onClick={() => setEditando({ ...editando, validaciones: editando.validaciones.filter((_, i) => i !== idx) })}
                >
                  <Icono nombre="cerrar" tamano={13} />
                </button>
              </div>
            );
          })}
          <select
            value=""
            onChange={(e) => {
              const def = VALIDACIONES_DISPONIBLES.find((d) => d.tipo === e.target.value);
              if (!def) return;
              const nueva = (def.conValor === 'numero'
                ? { tipo: def.tipo, valor: 0 }
                : def.conValor === 'fecha'
                  ? { tipo: def.tipo, valor: '' }
                  : def.tipo === 'ExpresionRegular'
                    ? { tipo: def.tipo, patron: '' }
                    : { tipo: def.tipo }) as ValidacionAtributo;
              setEditando({ ...editando, validaciones: [...editando.validaciones, nueva] });
            }}
          >
            <option value="">+ Agregar validación…</option>
            {VALIDACIONES_DISPONIBLES.map((d) => <option key={d.tipo} value={d.tipo}>{d.etiqueta}</option>)}
          </select>
          <p className="texto-suave">
            Las reglas condicionales (visibilidad/obligatoriedad dependiente de otros atributos) se administran en el módulo Reglas.
          </p>
        </PanelLateral>
      )}
    </>
  );
}
