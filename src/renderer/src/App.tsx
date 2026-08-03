import { useEffect, useState } from 'react';
import { Icono } from './componentes/Icono';
import { BusquedaGlobal } from './componentes/BusquedaGlobal';
import { SeguimientoPage } from './modulos/seguimiento/SeguimientoPage';
import { RecoleccionPage } from './modulos/recoleccion/RecoleccionPage';
import { IndicadoresPage } from './modulos/indicadores/IndicadoresPage';
import { AtributosPage } from './modulos/atributos/AtributosPage';
import { ListasPage } from './modulos/listas/ListasPage';
import { ReglasPage } from './modulos/reglas/ReglasPage';
import { ConfigGeneralPage } from './modulos/config-general/ConfigGeneralPage';
import { ExportacionPage } from './modulos/exportacion/ExportacionPage';
import { AuditoriaPage } from './modulos/auditoria/AuditoriaPage';
import { AdminPage } from './modulos/admin/AdminPage';
import { useNavegacion } from './stores/navegacion';

interface ModuloDef {
  id: string;
  etiqueta: string;
  icono: string;
  seccion: string;
  Componente: () => React.JSX.Element;
}

/** Registro de módulos: agregar un módulo nuevo = añadir una entrada. */
const MODULOS: ModuloDef[] = [
  { id: 'seguimiento', etiqueta: 'Seguimiento', icono: 'tablero', seccion: 'Operación', Componente: SeguimientoPage },
  { id: 'recoleccion', etiqueta: 'Recolección', icono: 'captura', seccion: 'Operación', Componente: RecoleccionPage },
  { id: 'indicadores', etiqueta: 'Indicadores', icono: 'indicador', seccion: 'Configuración', Componente: IndicadoresPage },
  { id: 'atributos', etiqueta: 'Atributos', icono: 'atributo', seccion: 'Configuración', Componente: AtributosPage },
  { id: 'listas', etiqueta: 'Listas', icono: 'lista', seccion: 'Configuración', Componente: ListasPage },
  { id: 'reglas', etiqueta: 'Reglas', icono: 'regla', seccion: 'Configuración', Componente: ReglasPage },
  { id: 'config-general', etiqueta: 'General', icono: 'ajustes', seccion: 'Configuración', Componente: ConfigGeneralPage },
  { id: 'exportacion', etiqueta: 'Exportación', icono: 'exportar', seccion: 'Sistema', Componente: ExportacionPage },
  { id: 'auditoria', etiqueta: 'Auditoría', icono: 'auditoria', seccion: 'Sistema', Componente: AuditoriaPage },
  { id: 'admin', etiqueta: 'Administración', icono: 'admin', seccion: 'Sistema', Componente: AdminPage }
];

export function App(): React.JSX.Element {
  const { moduloActual, navegar } = useNavegacion();
  const [tema, setTema] = useState<string>(() => localStorage.getItem('kpitracker-tema') ?? 'claro');
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    localStorage.setItem('kpitracker-tema', tema);
  }, [tema]);

  useEffect(() => {
    const manejar = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setBuscando((v) => !v);
      }
      if (e.key === 'Escape') setBuscando(false);
    };
    window.addEventListener('keydown', manejar);
    return () => window.removeEventListener('keydown', manejar);
  }, []);

  const modulo = MODULOS.find((m) => m.id === moduloActual) ?? MODULOS[0]!;
  const secciones = [...new Set(MODULOS.map((m) => m.seccion))];

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="logo">
          KPI<span>Tracker</span>
        </div>
        {secciones.map((seccion) => (
          <div key={seccion}>
            <div className="seccion">{seccion}</div>
            {MODULOS.filter((m) => m.seccion === seccion).map((m) => (
              <button
                key={m.id}
                className={`nav-item ${m.id === modulo.id ? 'activo' : ''}`}
                onClick={() => navegar(m.id)}
                data-testid={`nav-${m.id}`}
              >
                <Icono nombre={m.icono} />
                {m.etiqueta}
              </button>
            ))}
          </div>
        ))}
        <div className="pie">
          <button
            className="boton sutil"
            onClick={() => setTema(tema === 'claro' ? 'oscuro' : 'claro')}
            title={tema === 'claro' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro'}
          >
            <Icono nombre={tema === 'claro' ? 'luna' : 'sol'} />
          </button>
          <button className="boton sutil" onClick={() => setBuscando(true)} title="Búsqueda global (Ctrl+K)">
            <Icono nombre="buscar" />
          </button>
          <span className="atajo">Ctrl+K</span>
        </div>
      </nav>
      <main className="contenido" data-testid={`pagina-${modulo.id}`}>
        <modulo.Componente />
      </main>
      {buscando && <BusquedaGlobal alCerrar={() => setBuscando(false)} />}
    </div>
  );
}
