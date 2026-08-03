import type { PropsWithChildren, ReactNode } from 'react';
import { Icono } from './Icono';

export function Encabezado({ titulo, descripcion, acciones }: { titulo: string; descripcion?: string; acciones?: ReactNode }): React.JSX.Element {
  return (
    <div className="encabezado-pagina">
      <div>
        <h1>{titulo}</h1>
        {descripcion && <p className="descripcion">{descripcion}</p>}
      </div>
      {acciones && <div className="toolbar">{acciones}</div>}
    </div>
  );
}

export function Campo({
  etiqueta, obligatorio, error, children
}: PropsWithChildren<{ etiqueta: string; obligatorio?: boolean; error?: string | null }>): React.JSX.Element {
  return (
    <div className="campo">
      <label>
        {etiqueta} {obligatorio && <span className="obligatorio">*</span>}
      </label>
      {children}
      {error && <span className="ayuda-error">{error}</span>}
    </div>
  );
}

export function PanelLateral({
  titulo, alCerrar, pie, children
}: PropsWithChildren<{ titulo: string; alCerrar: () => void; pie?: ReactNode }>): React.JSX.Element {
  return (
    <>
      <div className="telon" onClick={alCerrar} />
      <aside className="panel-lateral" role="dialog" aria-label={titulo}>
        <header>
          <h2>{titulo}</h2>
          <button className="boton sutil" onClick={alCerrar} aria-label="Cerrar panel">
            <Icono nombre="cerrar" />
          </button>
        </header>
        <div className="cuerpo">{children}</div>
        {pie && <footer>{pie}</footer>}
      </aside>
    </>
  );
}

export function Vacio({ icono = '◻', mensaje, detalle }: { icono?: string; mensaje: string; detalle?: string }): React.JSX.Element {
  return (
    <div className="vacio">
      <div className="icono">{icono}</div>
      <div style={{ fontWeight: 600 }}>{mensaje}</div>
      {detalle && <div className="texto-suave" style={{ marginTop: 4 }}>{detalle}</div>}
    </div>
  );
}

export function ChipEstado({ estado }: { estado: string }): React.JSX.Element {
  const etiquetas: Record<string, string> = {
    Pendiente: 'Pendiente',
    EnProgreso: 'En progreso',
    Completo: 'Completo',
    Vencido: 'Vencido',
    NoAplica: 'No aplica'
  };
  return <span className={`chip ${estado.toLowerCase()}`}>{etiquetas[estado] ?? estado}</span>;
}

export function BarraProgreso({ valor, total }: { valor: number; total: number }): React.JSX.Element {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div className="barra-progreso">
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="texto-suave">{valor}/{total}</span>
    </div>
  );
}
