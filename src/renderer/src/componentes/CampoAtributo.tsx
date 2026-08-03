import type { Atributo, ElementoLista } from '@domain/index';
import { tipos } from '../dominio';
import { Campo } from './basicos';

export interface PropsCampoAtributo {
  atributo: Atributo;
  /** Valor crudo (texto tal cual lo edita el usuario); se parsea con el TypeDescriptor del atributo. */
  valor: string;
  obligatorio: boolean;
  error?: string | null;
  opciones?: ElementoLista[];
  onChange: (crudo: string) => void;
}

/**
 * Renderiza el editor adecuado para un atributo dinámico según su tipo de
 * dato (`TypeRegistry.editorHint`), sin bifurcar por tipo fuera de este
 * componente: agregar un tipo nuevo en el dominio no requiere tocar la UI
 * salvo, opcionalmente, un editor más específico aquí.
 */
export function CampoAtributo({ atributo, valor, obligatorio, error, opciones, onChange }: PropsCampoAtributo): React.JSX.Element {
  const descriptor = tipos.obtener(atributo.tipoDato);

  let entrada: React.JSX.Element;
  switch (descriptor.editorHint) {
    case 'textarea':
      entrada = <textarea rows={3} value={valor} onChange={(e) => onChange(e.target.value)} className={error ? 'invalido' : ''} />;
      break;
    case 'checkbox':
      entrada = (
        <select value={valor} onChange={(e) => onChange(e.target.value)} className={error ? 'invalido' : ''}>
          <option value="">— sin definir —</option>
          <option value="Sí">Sí</option>
          <option value="No">No</option>
        </select>
      );
      break;
    case 'select':
      entrada = (
        <select value={valor} onChange={(e) => onChange(e.target.value)} className={error ? 'invalido' : ''}>
          <option value="">— seleccionar —</option>
          {opciones?.map((o) => (
            <option key={o.id} value={o.codigo}>
              {o.descripcion}
            </option>
          ))}
        </select>
      );
      break;
    case 'multiselect':
      entrada = (
        <select
          multiple
          value={valor ? valor.split(';').map((v) => v.trim()) : []}
          onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value).join('; '))}
          className={error ? 'invalido' : ''}
        >
          {opciones?.map((o) => (
            <option key={o.id} value={o.codigo}>
              {o.descripcion}
            </option>
          ))}
        </select>
      );
      break;
    case 'date':
    case 'time':
      entrada = (
        <input type={descriptor.editorHint} value={valor} onChange={(e) => onChange(e.target.value)} className={error ? 'invalido' : ''} />
      );
      break;
    case 'datetime-local':
      entrada = (
        <input type="datetime-local" value={valor} onChange={(e) => onChange(e.target.value)} className={error ? 'invalido' : ''} />
      );
      break;
    case 'number':
      entrada = <input type="number" value={valor} onChange={(e) => onChange(e.target.value)} className={error ? 'invalido' : ''} />;
      break;
    default:
      entrada = <input type="text" value={valor} onChange={(e) => onChange(e.target.value)} className={error ? 'invalido' : ''} />;
  }

  return (
    <Campo etiqueta={atributo.nombre} obligatorio={obligatorio} error={error}>
      {entrada}
      {atributo.descripcion && <span className="texto-suave">{atributo.descripcion}</span>}
    </Campo>
  );
}
