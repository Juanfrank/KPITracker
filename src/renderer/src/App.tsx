import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Icono } from './componentes/Icono';
import { BusquedaGlobal } from './componentes/BusquedaGlobal';
import { SeguimientoPage } from './modulos/seguimiento/SeguimientoPage';
import { RecoleccionPage } from './modulos/recoleccion/RecoleccionPage';
import { IndicadoresPage } from './modulos/indicadores/IndicadoresPage';
import { ConfiguracionMetasPage } from './modulos/metas/ConfiguracionMetasPage';
import { CortesMedicionPage } from './modulos/cortes/CortesMedicionPage';
import { AtributosPage } from './modulos/atributos/AtributosPage';
import { ListasPage } from './modulos/listas/ListasPage';
import { ReglasPage } from './modulos/reglas/ReglasPage';
import { ConfigGeneralPage } from './modulos/config-general/ConfigGeneralPage';
import { ExportacionPage } from './modulos/exportacion/ExportacionPage';
import { AuditoriaPage } from './modulos/auditoria/AuditoriaPage';
import { AdminPage } from './modulos/admin/AdminPage';
import { AcercaDePage } from './modulos/acerca-de/AcercaDePage';
import { AuthProvider, useAuth } from './auth/AuthContext';
import type { IdentidadConPermisos } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import {
  puedeAdministrarCatalogos, puedeModificarAtributos, puedeModificarIndicadores, puedeModificarListas,
  puedeModificarMetas, puedeModificarReglas, puedeVerAdministracion, puedeVerAuditoria
} from './auth/permisosNav';

interface ModuloDef {
  id: string;
  etiqueta: string;
  icono: string;
  seccion: string;
  Componente: () => React.JSX.Element;
  /** Sin esto, el módulo es visible para cualquier sesión válida (Seguimiento/Recolección/Exportación/Acerca de). */
  visible?: (usuario: IdentidadConPermisos) => boolean;
}

/**
 * Registro de módulos: agregar un módulo nuevo = añadir una entrada (y una
 * `<Route>` en `App`). `visible` decide qué entra al sidebar y a las rutas
 * registradas (X1) — sin esto, un usuario sin ningún permiso (p. ej. "ver
 * como" un usuario estándar recién creado) podía navegar a pantallas de
 * Configuración/Sistema que el servidor de todos modos le habría rechazado:
 * ahora el nav refleja lo que puede hacer, no solo lo que hay.
 */
const MODULOS: ModuloDef[] = [
  { id: 'seguimiento', etiqueta: 'Seguimiento', icono: 'tablero', seccion: 'Operación', Componente: SeguimientoPage },
  { id: 'recoleccion', etiqueta: 'Recolección', icono: 'captura', seccion: 'Operación', Componente: RecoleccionPage },
  { id: 'indicadores', etiqueta: 'Indicadores', icono: 'indicador', seccion: 'Configuración', Componente: IndicadoresPage, visible: puedeModificarIndicadores },
  { id: 'configuracion-metas', etiqueta: 'Metas', icono: 'meta', seccion: 'Configuración', Componente: ConfiguracionMetasPage, visible: puedeModificarMetas },
  { id: 'cortes-medicion', etiqueta: 'Cortes', icono: 'reloj', seccion: 'Configuración', Componente: CortesMedicionPage, visible: puedeModificarMetas },
  { id: 'atributos', etiqueta: 'Atributos', icono: 'atributo', seccion: 'Configuración', Componente: AtributosPage, visible: puedeModificarAtributos },
  { id: 'listas', etiqueta: 'Listas', icono: 'lista', seccion: 'Configuración', Componente: ListasPage, visible: puedeModificarListas },
  { id: 'reglas', etiqueta: 'Reglas', icono: 'regla', seccion: 'Configuración', Componente: ReglasPage, visible: puedeModificarReglas },
  { id: 'config-general', etiqueta: 'General', icono: 'ajustes', seccion: 'Configuración', Componente: ConfigGeneralPage, visible: puedeAdministrarCatalogos },
  { id: 'exportacion', etiqueta: 'Exportación', icono: 'exportar', seccion: 'Sistema', Componente: ExportacionPage },
  { id: 'auditoria', etiqueta: 'Auditoría', icono: 'auditoria', seccion: 'Sistema', Componente: AuditoriaPage, visible: puedeVerAuditoria },
  { id: 'admin', etiqueta: 'Administración', icono: 'admin', seccion: 'Sistema', Componente: AdminPage, visible: puedeVerAdministracion },
  { id: 'acerca-de', etiqueta: 'Acerca de', icono: 'informacion', seccion: 'Sistema', Componente: AcercaDePage }
];

function modulosVisiblesPara(usuario: IdentidadConPermisos): ModuloDef[] {
  return MODULOS.filter((m) => !m.visible || m.visible(usuario));
}

/** Sidebar + contenido de la página activa (resuelta por `<Outlet/>`, ver `App`). Solo se monta con sesión válida. */
function Shell(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario, simulando, logout, salirSimulacion } = useAuth();
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

  // Filtrado por permiso (X1) — `usuario` siempre está poblado acá: `Shell` solo se monta bajo `RequireAuth`.
  const modulos = usuario ? modulosVisiblesPara(usuario) : [];
  const idActual = modulos.find((m) => location.pathname === `/${m.id}`)?.id ?? modulos[0]?.id;
  const secciones = [...new Set(modulos.map((m) => m.seccion))];

  const salir = (): void => {
    void logout().then(() => navigate('/login', { replace: true }));
  };

  const salirDeSimulacion = (): void => {
    void salirSimulacion();
  };

  return (
    <div className="pagina-shell">
      {simulando && (
        <div className="banner-simulacion" data-testid="banner-ver-como">
          <Icono nombre="usuario" tamano={15} />
          Viendo como: <strong>{simulando.nombreCompleto}</strong> — modo solo lectura
          <button className="boton sutil" onClick={salirDeSimulacion} data-testid="salir-ver-como">
            Salir
          </button>
        </div>
      )}
      <div className="shell">
        <nav className="sidebar">
          <div className="logo">
            KPI<span>Tracker</span>
          </div>
          {secciones.map((seccion) => (
            <div key={seccion}>
              <div className="seccion">{seccion}</div>
              {modulos.filter((m) => m.seccion === seccion).map((m) => (
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
        <main className="contenido" data-testid={idActual ? `pagina-${idActual}` : undefined}>
          <Outlet />
        </main>
        {buscando && <BusquedaGlobal alCerrar={() => setBuscando(false)} />}
      </div>
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

/**
 * Registro de rutas, filtrado por permiso (X1). Mientras la sesión está
 * `cargando` (`usuario` todavía `null`) se registra el catálogo completo —
 * evita que un F5 sobre una ruta legítima (p. ej. un admin en `/admin`)
 * caiga transitoriamente en el catch-all `*` antes de que `auth.yo`
 * resuelva. Una vez resuelta la identidad, una ruta ya no presente en
 * `modulosVisiblesPara` deja de matchear y el catch-all redirige — así el
 * filtrado también cubre la navegación directa por URL, no solo el sidebar.
 */
function AppRoutes(): React.JSX.Element {
  const { usuario } = useAuth();
  const modulos = usuario ? modulosVisiblesPara(usuario) : MODULOS;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to="/seguimiento" replace />} />
        {modulos.map((m) => (
          <Route key={m.id} path={m.id} element={<m.Componente />} />
        ))}
        <Route path="*" element={<Navigate to="/seguimiento" replace />} />
      </Route>
    </Routes>
  );
}

export function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
