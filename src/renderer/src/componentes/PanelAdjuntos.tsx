import { useEffect, useState } from 'react';
import type { Adjunto, EntidadAdjunto } from '@domain/index';
import { invocar } from '../api';
import { Icono } from './Icono';

/** Evidencias adjuntas de un indicador o resultado: subir, abrir y eliminar archivos. */
export function PanelAdjuntos({ entidad, entidadId }: { entidad: EntidadAdjunto; entidadId: string }): React.JSX.Element {
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [subiendo, setSubiendo] = useState(false);

  const cargar = (): void => {
    void invocar('adjuntos:listar', { entidad, entidadId }).then(setAdjuntos);
  };

  useEffect(() => {
    cargar();
  }, [entidad, entidadId]);

  const subir = async (): Promise<void> => {
    setSubiendo(true);
    try {
      const nuevo = await invocar('adjuntos:subir', { entidad, entidadId });
      if (nuevo) setAdjuntos((previo) => [nuevo, ...previo]);
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="toolbar" style={{ marginTop: 0 }}>
        <h4 style={{ margin: 0 }}>Evidencias adjuntas</h4>
        <div className="separador" />
        <button className="boton sutil" onClick={() => void subir()} disabled={subiendo} data-testid="subir-adjunto">
          <Icono nombre="subir" tamano={13} /> {subiendo ? 'Subiendo…' : 'Adjuntar archivo'}
        </button>
      </div>
      {adjuntos.length === 0 && <p className="texto-suave" style={{ margin: 0 }}>Sin adjuntos.</p>}
      {adjuntos.map((a) => (
        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }} data-testid={`adjunto-${a.nombreArchivo}`}>
          <button className="boton sutil" style={{ textAlign: 'left', flex: 1 }} onClick={() => void invocar('adjuntos:abrir', { id: a.id })}>
            <Icono nombre="adjunto" tamano={13} /> {a.nombreArchivo}
          </button>
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
