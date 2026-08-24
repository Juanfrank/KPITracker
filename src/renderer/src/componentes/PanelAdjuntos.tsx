import { useEffect, useRef, useState } from 'react';
import type { Adjunto, EntidadAdjunto } from '@domain/index';
import { invocar } from '../api';
import { subirArchivo } from '../rest';
import { Icono } from './Icono';

/**
 * Evidencias adjuntas: subir, abrir y eliminar archivos asociados a una
 * entidad. `maxArchivos` limita cuántos adjuntos se permiten (p. ej. 1 por
 * levantamiento indicador+período); al alcanzar el límite se oculta el
 * botón de subir hasta eliminar alguno.
 *
 * `adjuntos:subir`/`adjuntos:abrir` no tienen procedimiento tRPC (Fase 3
 * los movió a `POST /api/adjuntos` y `GET /api/adjuntos/:id/descarga`, ver
 * plan §5/§9.4) — el navegador elige el archivo con un `<input type="file">`
 * oculto en vez del diálogo nativo que abría el propio backend.
 */
export function PanelAdjuntos({
  entidad, entidadId, maxArchivos, titulo = 'Evidencias adjuntas', alCambiarCantidad
}: {
  entidad: EntidadAdjunto;
  entidadId: string;
  maxArchivos?: number;
  titulo?: string;
  /** Notifica al padre cuántos adjuntos hay (p. ej. para un resumen colapsado que los cuenta sin desplegar el panel). */
  alCambiarCantidad?: (cantidad: number) => void;
}): React.JSX.Element {
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const selectorArchivo = useRef<HTMLInputElement>(null);

  const cargar = (): void => {
    void invocar('adjuntos:listar', { entidad, entidadId }).then(setAdjuntos);
  };

  useEffect(() => {
    cargar();
  }, [entidad, entidadId]);

  useEffect(() => {
    alCambiarCantidad?.(adjuntos.length);
  }, [adjuntos, alCambiarCantidad]);

  const subir = async (archivo: File): Promise<void> => {
    setSubiendo(true);
    try {
      const nuevo = await subirArchivo<Adjunto>('/api/adjuntos', { entidad, entidadId, archivo });
      setAdjuntos((previo) => [nuevo, ...previo]);
    } finally {
      setSubiendo(false);
    }
  };

  const alcanzoLimite = maxArchivos != null && adjuntos.length >= maxArchivos;

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="toolbar" style={{ marginTop: 0 }}>
        <h4 style={{ margin: 0 }}>{titulo}</h4>
        <div className="separador" />
        {!alcanzoLimite && (
          <button
            className="boton sutil"
            onClick={() => selectorArchivo.current?.click()}
            disabled={subiendo}
            data-testid="subir-adjunto"
          >
            <Icono nombre="subir" tamano={13} /> {subiendo ? 'Subiendo…' : 'Adjuntar archivo'}
          </button>
        )}
        <input
          ref={selectorArchivo}
          type="file"
          style={{ display: 'none' }}
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void subir(archivo);
            e.target.value = '';
          }}
        />
      </div>
      {adjuntos.length === 0 && <p className="texto-suave" style={{ margin: 0 }}>Sin adjuntos.</p>}
      {adjuntos.map((a) => (
        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }} data-testid={`adjunto-${a.nombreArchivo}`}>
          <a className="boton sutil" style={{ textAlign: 'left', flex: 1 }} href={`/api/adjuntos/${a.id}/descarga`} target="_blank" rel="noreferrer">
            <Icono nombre="adjunto" tamano={13} /> {a.nombreArchivo}
          </a>
          <button
            className="boton sutil"
            onClick={() => {
              void invocar('adjuntos:eliminar', { id: a.id }).then(() => setAdjuntos((previo) => previo.filter((x) => x.id !== a.id)));
            }}
          >
            <Icono nombre="cerrar" tamano={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
