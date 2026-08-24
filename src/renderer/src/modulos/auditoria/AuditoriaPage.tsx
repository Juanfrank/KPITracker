import { useCallback, useEffect, useState } from 'react';
import type { RegistroAuditoria, ResultadoHistorial } from '@domain/index';
import { invocar } from '../../api';
import { Encabezado, Vacio } from '../../componentes/basicos';

/** Un registro de auditoría de Resultado sobre el campo "valor" es restaurable (Batch U11): su entidadId codifica indicadorId:periodoId:claveDesagregacion. */
function esRestaurable(r: RegistroAuditoria): boolean {
  return r.entidad === 'Resultado' && r.campo === 'valor' && r.accion !== 'Eliminar';
}

function partesResultado(entidadId: string): { indicadorId: string; periodoId: string; claveDesagregacion: string } | null {
  const partes = entidadId.split(':');
  if (partes.length !== 3) return null;
  const [indicadorId, periodoId, claveDesagregacion] = partes;
  if (!indicadorId || !periodoId || !claveDesagregacion) return null;
  return { indicadorId, periodoId, claveDesagregacion };
}

/**
 * La versión del historial que este registro de auditoría reemplazó — la
 * más reciente con `actualizadoEn` anterior a `fechaHora` Y cuyo `valor`
 * coincide con el `valorAnterior` que el propio registro dejó anotado.
 *
 * Ambas condiciones son necesarias: solo el timestamp no basta, porque un
 * historial es append-only y una restauración POSTERIOR puede archivar una
 * versión vieja con un `actualizadoEn` que, por casualidad, cae antes del
 * `fechaHora` de un registro de auditoría MÁS ANTIGUO y no relacionado
 * (falso positivo); exigir también que el valor coincida con lo que ESE
 * registro concreto anotó como "valor anterior" evita restaurar a un
 * estado que nunca precedió a este cambio en particular.
 *
 * `null` si el registro es la primera escritura de esa celda (no hay nada
 * previo a lo que volver) o si no se encuentra una versión que calce.
 */
function versionAnteriorA(historial: ResultadoHistorial[], registro: RegistroAuditoria): ResultadoHistorial | null {
  if (registro.valorAnterior == null) return null;
  const valorAnterior = Number(registro.valorAnterior);
  let objetivo: ResultadoHistorial | null = null;
  for (const h of historial) {
    if (h.valor === valorAnterior && h.actualizadoEn < registro.fechaHora && (!objetivo || h.actualizadoEn > objetivo.actualizadoEn)) {
      objetivo = h;
    }
  }
  return objetivo;
}

/**
 * Auditoría: historial inmutable de modificaciones con usuario, fecha,
 * acción, entidad y valores anterior/nuevo. Los registros de Resultado
 * pueden seleccionarse y restaurarse en lote (Batch U11), reutilizando
 * `recoleccion:restaurarVersion` (mismo mecanismo append-only que el
 * historial por celda de Recolección — nunca se pierde información).
 */
export function AuditoriaPage(): React.JSX.Element {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [entidad, setEntidad] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [restaurando, setRestaurando] = useState(false);
  const [mensajeRestauracion, setMensajeRestauracion] = useState<string | null>(null);

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

  // La selección se limpia cada vez que cambian los registros cargados (nuevo
  // filtro, o tras restaurar) — un checkbox marcado sobre una fila que ya no
  // está a la vista no debería sobrevivir en silencio.
  useEffect(() => setSeleccionados(new Set()), [registros]);

  const alternarSeleccion = (id: string): void => {
    setSeleccionados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  };

  const restaurarSeleccionados = async (): Promise<void> => {
    setRestaurando(true);
    setMensajeRestauracion(null);
    let restaurados = 0;
    let fallidos = 0;
    for (const r of registros) {
      if (!seleccionados.has(r.id)) continue;
      const partes = partesResultado(r.entidadId);
      if (!partes) {
        fallidos++;
        continue;
      }
      try {
        const historial = await invocar('recoleccion:historial', {
          indicadorId: partes.indicadorId, periodoId: partes.periodoId, claveDesagregacion: partes.claveDesagregacion
        });
        const objetivo = versionAnteriorA(historial, r);
        if (!objetivo) {
          fallidos++;
          continue;
        }
        await invocar('recoleccion:restaurarVersion', { ...partes, version: objetivo.version });
        restaurados++;
      } catch {
        fallidos++;
      }
    }
    setRestaurando(false);
    setMensajeRestauracion(
      fallidos === 0
        ? `${restaurados} resultado(s) restaurado(s) a su valor anterior.`
        : `${restaurados} resultado(s) restaurado(s); ${fallidos} no se pudieron restaurar (sin versión anterior disponible).`
    );
    await cargar();
  };

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
        {seleccionados.size > 0 && (
          <button
            className="boton"
            disabled={restaurando}
            onClick={() => void restaurarSeleccionados()}
            data-testid="restaurar-seleccionados"
          >
            {restaurando ? 'Restaurando…' : `Restaurar seleccionados (${seleccionados.size})`}
          </button>
        )}
      </div>
      {mensajeRestauracion && (
        <div className="aviso info" data-testid="aviso-restaurar-seleccionados">{mensajeRestauracion}</div>
      )}
      <div className="tabla-envoltura">
        <table className="tabla" data-testid="tabla-auditoria">
          <thead>
            <tr>
              <th style={{ width: 32 }} aria-label="Seleccionar" />
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
                <td>
                  {esRestaurable(r) && (
                    <input
                      type="checkbox"
                      checked={seleccionados.has(r.id)}
                      onChange={() => alternarSeleccion(r.id)}
                      style={{ width: 'auto' }}
                      data-testid={`seleccionar-auditoria-${r.id}`}
                    />
                  )}
                </td>
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
                <td colSpan={8}>
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
