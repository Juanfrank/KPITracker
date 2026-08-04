import type { Condicion, Operando } from '@domain/index';
import {
  agregarHijo, condicionVacia, envolverEnGrupo, esCondicion, esOperadorLogico,
  quitarHijo, reemplazarHijo
} from '@domain/index';
import { Campo } from './basicos';
import { Icono } from './Icono';

/** Operadores de comparación ofrecidos por el constructor visual (los lógicos and/or/not se manejan aparte). */
const OPERADORES_COMPARACION: Array<{ op: string; etiqueta: string; aridad: 1 | 2 | 3 }> = [
  { op: 'eq', etiqueta: 'es igual a', aridad: 2 },
  { op: 'ne', etiqueta: 'es distinto de', aridad: 2 },
  { op: 'gt', etiqueta: 'es mayor que', aridad: 2 },
  { op: 'gte', etiqueta: 'es mayor o igual que', aridad: 2 },
  { op: 'lt', etiqueta: 'es menor que', aridad: 2 },
  { op: 'lte', etiqueta: 'es menor o igual que', aridad: 2 },
  { op: 'contains', etiqueta: 'contiene', aridad: 2 },
  { op: 'matches', etiqueta: 'cumple la expresión regular', aridad: 2 },
  { op: 'isEmpty', etiqueta: 'está vacío', aridad: 1 },
  { op: 'notEmpty', etiqueta: 'no está vacío', aridad: 1 },
  { op: 'between', etiqueta: 'está entre', aridad: 3 }
];

const ID_DATALIST = 'editor-condicion-atributos';

export interface PropsEditorCondicion {
  condicion: Condicion;
  atributosDisponibles: string[];
  alCambiar: (nueva: Condicion) => void;
  /** Presente solo si este nodo puede eliminarse de su padre (no aplica a la raíz). */
  alEliminar?: () => void;
}

/**
 * Constructor visual del AST de condiciones del motor de reglas: permite
 * agrupar con Y/O/NO, agregar y quitar condiciones anidadas sin editar
 * JSON. Cada nodo puede envolverse en un nuevo grupo lógico en cualquier
 * momento (`envolverEnGrupo`), habilitando árboles de profundidad
 * arbitraria construidos incrementalmente.
 */
export function EditorCondicion(props: PropsEditorCondicion): React.JSX.Element {
  return (
    <div>
      {esOperadorLogico(props.condicion.op) ? <EditorGrupo {...props} /> : <EditorComparacion {...props} />}
      <datalist id={ID_DATALIST}>
        {props.atributosDisponibles.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
    </div>
  );
}

function BotonesAgrupar({ condicion, alCambiar }: { condicion: Condicion; alCambiar: (n: Condicion) => void }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <button className="boton sutil" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => alCambiar(envolverEnGrupo(condicion, 'and'))}>
        Agrupar con Y
      </button>
      <button className="boton sutil" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => alCambiar(envolverEnGrupo(condicion, 'or'))}>
        Agrupar con O
      </button>
    </div>
  );
}

function EditorGrupo({ condicion, atributosDisponibles, alCambiar, alEliminar }: PropsEditorCondicion): React.JSX.Element {
  const esNot = condicion.op === 'not';

  return (
    <div className="tarjeta" style={{ padding: 10, borderStyle: 'dashed' }}>
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <select
          value={condicion.op}
          onChange={(e) => {
            const nuevoOp = e.target.value;
            if (nuevoOp === 'not') {
              alCambiar({ op: 'not', args: [condicion.args[0] ?? condicionVacia()] });
            } else if (esNot) {
              alCambiar({ op: nuevoOp, args: condicion.args });
            } else {
              alCambiar({ ...condicion, op: nuevoOp });
            }
          }}
        >
          <option value="and">Y (se cumplen todas)</option>
          <option value="or">O (se cumple alguna)</option>
          <option value="not">NO (se niega)</option>
        </select>
        <div className="separador" />
        {alEliminar && (
          <button className="boton sutil" onClick={alEliminar} title="Quitar este grupo">
            <Icono nombre="cerrar" tamano={14} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 14, borderLeft: '2px solid var(--borde)' }}>
        {condicion.args.map((arg, indice) => {
          const hijo = esCondicion(arg) ? arg : condicionVacia();
          return (
            <EditorCondicion
              key={indice}
              condicion={hijo}
              atributosDisponibles={atributosDisponibles}
              alCambiar={(nuevo) => alCambiar(reemplazarHijo(condicion, indice, nuevo))}
              alEliminar={!esNot && condicion.args.length > 1 ? () => alCambiar(quitarHijo(condicion, indice)) : undefined}
            />
          );
        })}
      </div>
      {!esNot && (
        <button className="boton sutil" style={{ marginTop: 6 }} onClick={() => alCambiar(agregarHijo(condicion))}>
          <Icono nombre="mas" tamano={13} /> Agregar condición
        </button>
      )}
    </div>
  );
}

function valorOperando(operando: Operando | undefined): { texto: string; esAtributo: boolean } {
  if (!operando || esCondicion(operando)) return { texto: '', esAtributo: false };
  if ('attr' in operando) return { texto: operando.attr, esAtributo: true };
  return { texto: operando.literal == null ? '' : String(operando.literal), esAtributo: false };
}

function OperandoEditor({
  operando, etiqueta, alCambiar
}: {
  operando: Operando | undefined;
  etiqueta: string;
  alCambiar: (v: Operando) => void;
}): React.JSX.Element {
  const actual = valorOperando(operando);
  return (
    <Campo etiqueta={etiqueta}>
      <input
        type="text"
        list={actual.esAtributo ? ID_DATALIST : undefined}
        value={actual.texto}
        onChange={(e) => {
          const texto = e.target.value;
          if (actual.esAtributo) {
            alCambiar({ attr: texto });
          } else {
            const numero = Number(texto);
            alCambiar({ literal: texto !== '' && !Number.isNaN(numero) ? numero : texto });
          }
        }}
        data-testid="condicion-valor"
      />
      <label className="texto-suave" style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={actual.esAtributo}
          onChange={(e) => alCambiar(e.target.checked ? { attr: actual.texto } : { literal: actual.texto })}
          data-testid="condicion-valor-es-atributo"
        />
        Comparar contra otro atributo
      </label>
    </Campo>
  );
}

function EditorComparacion({ condicion, alCambiar, alEliminar }: PropsEditorCondicion): React.JSX.Element {
  const definicion = OPERADORES_COMPARACION.find((o) => o.op === condicion.op) ?? OPERADORES_COMPARACION[0]!;
  const izquierda = valorOperando(condicion.args[0]);

  const cambiarOperador = (nuevoOp: string): void => {
    const nuevaDefinicion = OPERADORES_COMPARACION.find((o) => o.op === nuevoOp) ?? OPERADORES_COMPARACION[0]!;
    const args: Operando[] = [condicion.args[0] ?? { attr: '' }];
    for (let i = 1; i < nuevaDefinicion.aridad; i++) args.push(condicion.args[i] ?? { literal: '' });
    alCambiar({ op: nuevoOp, args });
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
      <Campo etiqueta="Atributo">
        <input
          type="text"
          list={ID_DATALIST}
          value={izquierda.texto}
          placeholder="nombre del atributo"
          onChange={(e) => alCambiar(reemplazarHijo(condicion, 0, { attr: e.target.value }))}
          data-testid="condicion-atributo"
        />
      </Campo>
      <Campo etiqueta="Condición">
        <select value={condicion.op} onChange={(e) => cambiarOperador(e.target.value)} data-testid="condicion-operador">
          {OPERADORES_COMPARACION.map((o) => (
            <option key={o.op} value={o.op}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      </Campo>
      {definicion.aridad >= 2 && (
        <OperandoEditor
          operando={condicion.args[1]}
          etiqueta={definicion.aridad === 3 ? 'Desde' : 'Valor'}
          alCambiar={(v) => alCambiar(reemplazarHijo(condicion, 1, v))}
        />
      )}
      {definicion.aridad >= 3 && (
        <OperandoEditor
          operando={condicion.args[2]}
          etiqueta="Hasta"
          alCambiar={(v) => alCambiar(reemplazarHijo(condicion, 2, v))}
        />
      )}
      <BotonesAgrupar condicion={condicion} alCambiar={alCambiar} />
      {alEliminar && (
        <button className="boton sutil" onClick={alEliminar} title="Quitar condición">
          <Icono nombre="cerrar" tamano={14} />
        </button>
      )}
    </div>
  );
}
