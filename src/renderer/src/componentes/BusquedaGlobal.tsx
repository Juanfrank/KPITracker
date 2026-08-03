import { useEffect, useRef, useState } from 'react';
import type { Indicador } from '@domain/index';
import { invocar } from '../api';
import { useNavegacion } from '../stores/navegacion';

/** Búsqueda global (Ctrl+K): localiza indicadores y navega a su captura. */
export function BusquedaGlobal({ alCerrar }: { alCerrar: () => void }): React.JSX.Element {
  const [texto, setTexto] = useState('');
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [activo, setActivo] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const { navegar } = useNavegacion();

  useEffect(() => {
    entrada.current?.focus();
    void invocar('indicadores:listar', undefined).then(setIndicadores);
  }, []);

  const filtrados = texto.trim()
    ? indicadores.filter((i) => i.nombre.toLowerCase().includes(texto.toLowerCase()))
    : indicadores.slice(0, 8);

  const abrir = (indicadorId: string): void => {
    navegar('recoleccion', { indicadorId });
    alCerrar();
  };

  return (
    <>
      <div className="telon" onClick={alCerrar} />
      <div className="busqueda-global" role="dialog" aria-label="Búsqueda global">
        <input
          ref={entrada}
          type="search"
          placeholder="Buscar indicador…"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setActivo(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActivo((a) => Math.min(a + 1, filtrados.length - 1));
            if (e.key === 'ArrowUp') setActivo((a) => Math.max(a - 1, 0));
            if (e.key === 'Enter' && filtrados[activo]) abrir(filtrados[activo].id);
          }}
        />
        <div className="resultados">
          {filtrados.length === 0 && <div className="vacio">Sin resultados</div>}
          {filtrados.map((i, idx) => (
            <button key={i.id} className={`resultado ${idx === activo ? 'activo' : ''}`} onClick={() => abrir(i.id)}>
              <span>{i.nombre}</span>
              <span className="texto-suave">{i.periodicidad}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
