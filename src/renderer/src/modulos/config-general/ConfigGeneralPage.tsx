import { useEffect, useRef, useState } from 'react';
import type { ConfiguracionGeneral } from '@domain/index';
import type { ReglaFechaLimiteDisponible } from '@application/use-cases/ServicioConfiguracion';
import { invocar } from '../../api';
import { Campo, Encabezado } from '../../componentes/basicos';

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Configuración General: parámetros globales con autoguardado.
 * Los parámetros de la regla de fecha límite se construyen dinámicamente a
 * partir de los metadatos que expone el registro de reglas (OCP).
 */
export function ConfigGeneralPage(): React.JSX.Element {
  const [config, setConfig] = useState<ConfiguracionGeneral | null>(null);
  const [reglas, setReglas] = useState<ReglaFechaLimiteDisponible[]>([]);
  const [estado, setEstado] = useState<'inactivo' | 'guardando' | 'guardado' | 'error'>('inactivo');
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void invocar('config:obtener', undefined).then(setConfig);
    void invocar('config:reglasFechaLimite', undefined).then(setReglas);
  }, []);

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

  if (!config) return <div className="texto-suave">Cargando…</div>;

  const reglaActual = reglas.find((r) => r.tipo === config.reglaFechaLimite.tipo);

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
    </>
  );
}
