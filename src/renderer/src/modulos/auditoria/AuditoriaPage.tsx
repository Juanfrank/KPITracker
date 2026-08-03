import { useCallback, useEffect, useState } from 'react';
import type { RegistroAuditoria } from '@domain/index';
import { invocar } from '../../api';
import { Encabezado, Vacio } from '../../componentes/basicos';

/**
 * Auditoría: historial inmutable de modificaciones con usuario, fecha,
 * acción, entidad y valores anterior/nuevo.
 */
export function AuditoriaPage(): React.JSX.Element {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [entidad, setEntidad] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const cargar = useCallback(async (): Promise<void> => {
    setRegistros(
      await invocar('auditoria:consultar', {
        entidad: entidad || undefined,
        desde: desde ? `${desde}T00:00:00` : undefined,
        hasta: hasta ? `${hasta}T23:59:59` : undefined,
        limite: 500
      })
    );
  }, [entidad, desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const entidades = ['Indicador', 'Resultado', 'Levantamiento', 'Lista', 'ElementoLista', 'Atributo', 'ValorAtributo', 'Meta', 'ReglaNegocio', 'ConfiguracionGeneral'];

  return (
    <>
      <Encabezado
        titulo="Auditoría"
        descripcion="Registro histórico de todas las modificaciones realizadas en el sistema."
      />
      <div className="toolbar">
        <select value={entidad} onChange={(e) => setEntidad(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Todas las entidades</option>
          {entidades.map((en) => <option key={en} value={en}>{en}</option>)}
        </select>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ width: 'auto' }} />
        <span className="texto-suave">a</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ width: 'auto' }} />
      </div>
      <div className="tabla-envoltura">
        <table className="tabla" data-testid="tabla-auditoria">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>Campo</th>
              <th>Valor anterior</th>
              <th>Valor nuevo</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <td className="texto-suave">{new Date(r.fechaHora).toLocaleString('es')}</td>
                <td>{r.usuario}</td>
                <td>{r.accion}</td>
                <td>
                  {r.entidad}
                  <div className="texto-suave mono" style={{ fontSize: 11 }}>{r.entidadId.slice(0, 26)}</div>
                </td>
                <td>{r.campo ?? '—'}</td>
                <td className="mono" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.valorAnterior ?? ''}>
                  {r.valorAnterior ?? '—'}
                </td>
                <td className="mono" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.valorNuevo ?? ''}>
                  {r.valorNuevo ?? '—'}
                </td>
              </tr>
            ))}
            {registros.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <Vacio icono="◇" mensaje="Sin registros de auditoría" detalle="con los filtros seleccionados" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
