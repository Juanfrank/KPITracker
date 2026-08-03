import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConfiguracionGeneral, CortePeriodicidad, DefinicionPeriodicidad } from '@domain/index';
import { NOMBRES_MES, validarDefinicionPeriodicidad } from '@domain/index';
import type { ReglaFechaLimiteDisponible } from '@application/use-cases/ServicioConfiguracion';
import { invocar } from '../../api';
import { Campo, Encabezado, PanelLateral, Vacio } from '../../componentes/basicos';
import { Icono } from '../../componentes/Icono';

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function definicionVacia(): DefinicionPeriodicidad {
  return {
    id: '',
    nombre: '',
    descripcion: '',
    cortes: [{ numero: 1, etiqueta: 'Corte 1', mesInicio: 1, mesFin: 12 }],
    creadoEn: '',
    actualizadoEn: ''
  };
}

/**
 * Configuración General: parámetros globales con autoguardado, más la
 * administración de definiciones de periodicidad Personalizada (particiones
 * del año en cortes, sin huecos ni solapes, seleccionables luego al
 * configurar un indicador).
 */
export function ConfigGeneralPage(): React.JSX.Element {
  const [config, setConfig] = useState<ConfiguracionGeneral | null>(null);
  const [reglas, setReglas] = useState<ReglaFechaLimiteDisponible[]>([]);
  const [estado, setEstado] = useState<'inactivo' | 'guardando' | 'guardado' | 'error'>('inactivo');
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [periodicidades, setPeriodicidades] = useState<DefinicionPeriodicidad[]>([]);
  const [editandoDef, setEditandoDef] = useState<DefinicionPeriodicidad | null>(null);
  const [erroresDef, setErroresDef] = useState<string[]>([]);

  const cargarPeriodicidades = useCallback(async (): Promise<void> => {
    setPeriodicidades(await invocar('periodicidades:listar', undefined));
  }, []);

  useEffect(() => {
    void invocar('config:obtener', undefined).then(setConfig);
    void invocar('config:reglasFechaLimite', undefined).then(setReglas);
    void cargarPeriodicidades();
  }, [cargarPeriodicidades]);

  const actualizar = (parcial: Partial<ConfiguracionGeneral>): void => {
    if (!config) return;
    const nueva = { ...config, ...parcial };
    setConfig(nueva);
    setEstado('guardando');
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      invocar('config:guardar', nueva)
        .then(() => setEstado('guardado'))
        .catch(() => setEstado('error'));
    }, 500);
  };

  const abrirDefinicion = (definicion: DefinicionPeriodicidad): void => {
    setErroresDef([]);
    setEditandoDef(definicion);
  };

  const actualizarCorte = (indice: number, nuevo: CortePeriodicidad): void => {
    if (!editandoDef) return;
    setEditandoDef({ ...editandoDef, cortes: editandoDef.cortes.map((c, i) => (i === indice ? nuevo : c)) });
  };

  const agregarCorte = (): void => {
    if (!editandoDef) return;
    const ultimo = editandoDef.cortes[editandoDef.cortes.length - 1];
    const numero = editandoDef.cortes.length + 1;
    setEditandoDef({
      ...editandoDef,
      cortes: [
        ...editandoDef.cortes,
        { numero, etiqueta: `Corte ${numero}`, mesInicio: ultimo ? Math.min(ultimo.mesFin + 1, 12) : 1, mesFin: 12 }
      ]
    });
  };

  const quitarCorte = (indice: number): void => {
    if (!editandoDef) return;
    setEditandoDef({
      ...editandoDef,
      cortes: editandoDef.cortes.filter((_, i) => i !== indice).map((c, i) => ({ ...c, numero: i + 1 }))
    });
  };

  const guardarDefinicion = async (): Promise<void> => {
    if (!editandoDef) return;
    try {
      await invocar('periodicidades:guardar', editandoDef);
      setEditandoDef(null);
      await cargarPeriodicidades();
    } catch (error) {
      const e = error as Error & { detalles?: string[] };
      setErroresDef(e.detalles?.length ? e.detalles : [e.message]);
    }
  };

  if (!config) return <div className="texto-suave">Cargando…</div>;

  const reglaActual = reglas.find((r) => r.tipo === config.reglaFechaLimite.tipo);
  const erroresCortesEnVivo = editandoDef ? validarDefinicionPeriodicidad(editandoDef.cortes) : [];

  return (
    <>
      <Encabezado
        titulo="Configuración General"
        descripcion="Parámetros globales de la aplicación. Los cambios se guardan automáticamente."
        acciones={
          estado !== 'inactivo' ? (
            <span className={`aviso ${estado === 'error' ? 'error' : estado === 'guardado' ? 'exito' : 'info'}`}>
              {estado === 'guardando' ? 'Guardando…' : estado === 'guardado' ? 'Guardado' : 'Error al guardar'}
            </span>
          ) : undefined
        }
      />
      <div className="tarjeta">
        <div className="fila-form c2">
          <Campo etiqueta="Año inicial" obligatorio>
            <input
              type="number"
              min={2000}
              max={2100}
              value={config.anioInicial}
              onChange={(e) => actualizar({ anioInicial: Number(e.target.value) })}
              data-testid="config-anio-inicial"
            />
            <span className="texto-suave">Desde este año pueden levantarse resultados.</span>
          </Campo>
          <Campo etiqueta="Nombre de la institución">
            <input
              type="text"
              value={config.nombreInstitucion}
              onChange={(e) => actualizar({ nombreInstitucion: e.target.value })}
              placeholder="Ej.: Poder Judicial"
            />
          </Campo>
        </div>
      </div>

      <div className="tarjeta">
        <h3 style={{ marginTop: 0 }}>Fecha límite de llenado</h3>
        <div className="fila-form c2">
          <Campo etiqueta="Regla" obligatorio>
            <select
              value={config.reglaFechaLimite.tipo}
              onChange={(e) => {
                const regla = reglas.find((r) => r.tipo === e.target.value);
                const parametros: Record<string, unknown> = {};
                for (const p of regla?.parametros ?? []) parametros[p.nombre] = p.min ?? 1;
                actualizar({ reglaFechaLimite: { tipo: e.target.value, parametros } });
              }}
              data-testid="config-regla-fecha"
            >
              {reglas.map((r) => (
                <option key={r.tipo} value={r.tipo}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
          {reglaActual?.parametros.map((p) => (
            <Campo key={p.nombre} etiqueta={p.etiqueta}>
              {p.tipo === 'weekday' ? (
                <select
                  value={Number(config.reglaFechaLimite.parametros[p.nombre] ?? 1)}
                  onChange={(e) =>
                    actualizar({
                      reglaFechaLimite: {
                        ...config.reglaFechaLimite,
                        parametros: { ...config.reglaFechaLimite.parametros, [p.nombre]: Number(e.target.value) }
                      }
                    })
                  }
                >
                  {DIAS_SEMANA.map((dia, i) => (
                    <option key={dia} value={i}>
                      {dia}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={p.min}
                  max={p.max}
                  value={Number(config.reglaFechaLimite.parametros[p.nombre] ?? p.min ?? 0)}
                  onChange={(e) =>
                    actualizar({
                      reglaFechaLimite: {
                        ...config.reglaFechaLimite,
                        parametros: { ...config.reglaFechaLimite.parametros, [p.nombre]: Number(e.target.value) }
                      }
                    })
                  }
                />
              )}
            </Campo>
          ))}
        </div>
      </div>

      <div className="tarjeta">
        <h3 style={{ marginTop: 0 }}>Exportación analítica</h3>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.exportarCsv}
            onChange={(e) => actualizar({ exportarCsv: e.target.checked })}
            style={{ width: 'auto' }}
          />
          Además del Parquet, generar también CSV UTF-8 (para Excel u otras herramientas)
        </label>
      </div>

      <div className="tarjeta">
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Periodicidades personalizadas</h3>
          <div className="separador" />
          <button className="boton primario" onClick={() => abrirDefinicion(definicionVacia())} data-testid="nueva-periodicidad">
            <Icono nombre="mas" /> Nueva definición
          </button>
        </div>
        <p className="texto-suave" style={{ marginTop: 4 }}>
          Particiona el año en cortes propios (por ejemplo, un cuatrimestre especial) para usarlos como periodicidad de un indicador.
          Los cortes deben cubrir de enero a diciembre sin huecos ni solapes.
        </p>
        <div className="tabla-envoltura">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cortes</th>
              </tr>
            </thead>
            <tbody>
              {periodicidades.map((d) => (
                <tr key={d.id} onClick={() => abrirDefinicion(d)} style={{ cursor: 'pointer' }} data-testid={`periodicidad-${d.nombre}`}>
                  <td><strong>{d.nombre}</strong></td>
                  <td className="texto-suave">{d.cortes.map((c) => c.etiqueta).join(', ')}</td>
                </tr>
              ))}
              {periodicidades.length === 0 && (
                <tr>
                  <td colSpan={2}>
                    <Vacio mensaje="Sin definiciones" detalle="Cree la primera si necesita una periodicidad fuera de las estándar." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editandoDef && (
        <PanelLateral
          titulo={editandoDef.id ? 'Editar definición' : 'Nueva definición'}
          alCerrar={() => setEditandoDef(null)}
          pie={
            <>
              {editandoDef.id && (
                <button
                  className="boton peligro"
                  onClick={() => {
                    void invocar('periodicidades:eliminar', { id: editandoDef.id }).then(() => {
                      setEditandoDef(null);
                      void cargarPeriodicidades();
                    });
                  }}
                >
                  Eliminar
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="boton" onClick={() => setEditandoDef(null)}>Cancelar</button>
              <button className="boton primario" onClick={() => void guardarDefinicion()} data-testid="guardar-periodicidad">
                Guardar
              </button>
            </>
          }
        >
          {erroresDef.length > 0 && (
            <div className="aviso error">
              {erroresDef.map((e) => <div key={e}>{e}</div>)}
            </div>
          )}
          <Campo etiqueta="Nombre" obligatorio>
            <input
              type="text"
              value={editandoDef.nombre}
              onChange={(e) => setEditandoDef({ ...editandoDef, nombre: e.target.value })}
              data-testid="periodicidad-nombre"
              autoFocus
            />
          </Campo>
          <Campo etiqueta="Descripción">
            <textarea rows={2} value={editandoDef.descripcion} onChange={(e) => setEditandoDef({ ...editandoDef, descripcion: e.target.value })} />
          </Campo>

          <h4 style={{ margin: '8px 0 0' }}>Cortes</h4>
          {editandoDef.cortes.map((c, indice) => (
            <div key={indice} className="fila-form c3" style={{ alignItems: 'end' }}>
              <Campo etiqueta={`Corte ${c.numero}`}>
                <input type="text" value={c.etiqueta} onChange={(e) => actualizarCorte(indice, { ...c, etiqueta: e.target.value })} data-testid={`corte-etiqueta-${c.numero}`} />
              </Campo>
              <Campo etiqueta="Mes inicio">
                <select value={c.mesInicio} onChange={(e) => actualizarCorte(indice, { ...c, mesInicio: Number(e.target.value) })}>
                  {NOMBRES_MES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </Campo>
              <div style={{ display: 'flex', gap: 6, alignItems: 'end' }}>
                <Campo etiqueta="Mes fin">
                  <select value={c.mesFin} onChange={(e) => actualizarCorte(indice, { ...c, mesFin: Number(e.target.value) })}>
                    {NOMBRES_MES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </Campo>
                {editandoDef.cortes.length > 1 && (
                  <button className="boton sutil" onClick={() => quitarCorte(indice)} title="Quitar corte">
                    <Icono nombre="cerrar" tamano={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button className="boton" onClick={agregarCorte} data-testid="agregar-corte">
            <Icono nombre="mas" tamano={14} /> Corte
          </button>

          {erroresCortesEnVivo.length > 0 && (
            <div className="aviso info">
              {erroresCortesEnVivo.map((e) => <div key={e}>{e}</div>)}
            </div>
          )}
        </PanelLateral>
      )}
    </>
  );
}
