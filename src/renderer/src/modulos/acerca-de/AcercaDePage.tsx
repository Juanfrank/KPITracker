import { useEffect, useState } from 'react';
import type { CanalesIpc } from '@shared/ipc';
import { invocar } from '../../api';
import { Encabezado } from '../../componentes/basicos';

type InfoSistema = CanalesIpc['sistema:info']['res'];

/** Fila de solo lectura etiqueta/valor, reutilizada para todos los datos estáticos de esta página. */
function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--borde)' }}>
      <div style={{ width: 160, color: 'var(--texto-3)' }}>{etiqueta}</div>
      <div>{valor}</div>
    </div>
  );
}

export function AcercaDePage(): React.JSX.Element {
  const [info, setInfo] = useState<InfoSistema | null>(null);

  useEffect(() => {
    void invocar('sistema:info', undefined).then(setInfo);
  }, []);

  return (
    <>
      <Encabezado titulo="Acerca de" descripcion="Información de la aplicación y del entorno en el que corre." />
      {info && (
        <>
          <div className="tarjeta">
            <h3 style={{ marginTop: 0 }}>{info.nombre}</h3>
            <Fila etiqueta="Versión" valor={<span data-testid="acerca-version">{info.version}</span>} />
            <Fila etiqueta="Autor" valor={info.autor} />
            <Fila etiqueta="Licencia" valor={info.licencia} />
            <Fila
              etiqueta="Soporte"
              valor={
                <a href={info.urlSoporte} target="_blank" rel="noreferrer" data-testid="acerca-soporte">
                  {info.urlSoporte}
                </a>
              }
            />
          </div>
          <div className="tarjeta">
            <h3 style={{ marginTop: 0 }}>Entorno</h3>
            <Fila etiqueta="Node" valor={info.node} />
          </div>
        </>
      )}
    </>
  );
}
