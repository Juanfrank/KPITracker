import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
import { AcercaDePage } from './modulos/acerca-de/AcercaDePage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';

interface ModuloDef {
  id: string;
  etiqueta: string;
  icono: string;
  seccion: string;
  Componente: () => React.JSX.Element;
}

/** Registro de módulos: agregar un módulo nuevo = añadir una entrada (y una `<Route>` en `App`). */
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
  { id: 'admin', etiqueta: 'Administración', icono: 'admin', seccion: 'Sistema', Componente: AdminPage },
  { id: 'acerca-de', etiqueta: 'Acerca de', icono: 'informacion', seccion: 'Sistema', Componente: AcercaDePage }
];

/** Sidebar + contenido de la página activa (resuelta por `<Outlet/>`, ver `App`). Solo se monta con sesión válida. */
function Shell(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario, logout } = useAuth();
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

  const idActual = MODULOS.find((m) => location.pathname === `/${m.id}`)?.id ?? MODULOS[0]!.id;
  const secciones = [...new Set(MODULOS.map((m) => m.seccion))];

  const salir = (): void => {
    void logout().then(() => navigate('/login', { replace: true }));
  };

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
              <NavLink
                key={m.id}
                to={`/${m.id}`}
                className={({ isActive }) => `nav-item ${isActive ? 'activo' : ''}`}
                data-testid={`nav-${m.id}`}
              >
                <Icono nombre={m.icono} />
                {m.etiqueta}
              </NavLink>
            ))}
          </div>
        ))}
        <div style={{ marginTop: 'auto', padding: '10px 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icono nombre="usuario" tamano={15} />
          <span className="texto-suave" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {usuario?.nombreCompleto}
          </span>
          <button className="boton sutil" onClick={salir} title="Cerrar sesión" data-testid="cerrar-sesion">
            <Icono nombre="salir" tamano={15} />
          </button>
        </div>
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
      <main className="contenido" data-testid={`pagina-${idActual}`}>
        <Outlet />
      </main>
      {buscando && <BusquedaGlobal alCerrar={() => setBuscando(false)} />}
    </div>
  );
}

/** Guard de sesión: sin `usuario` redirige a `/login` conservando la ruta de origen (`state.from`, ver `LoginPage`). */
function RequireAuth(): React.JSX.Element {
  const { usuario, cargando } = useAuth();
  const location = useLocation();

  if (cargando) return <div className="vacio" />;
  if (!usuario) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Shell />;
}

export function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route index element={<Navigate to="/seguimiento" replace />} />
          {MODULOS.map((m) => (
            <Route key={m.id} path={m.id} element={<m.Componente />} />
          ))}
          <Route path="*" element={<Navigate to="/seguimiento" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
