import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { trpcClient } from '../trpc';

/** Identidad + permisos efectivos (Batch T) — misma forma que devuelve `auth.yo`/`auth.login` en el servidor. */
export type IdentidadConPermisos = NonNullable<Awaited<ReturnType<typeof trpcClient.auth.yo.query>>>;

/** Usuario simulado activo (U2, "Ver como"), o `null` fuera de simulación — ver `simulacion.actual` en el servidor. */
export type SimulacionActual = Awaited<ReturnType<typeof trpcClient.simulacion.actual.query>>;

interface EstadoAuth {
  /**
   * `null` mientras se restaura la sesión (`cargando: true`) o si no hay
   * sesión válida. U2: mientras haya una simulación activa, `usuario`
   * refleja al usuario SIMULADO (identidad + permisos), no al administrador
   * real detrás — así el resto de la UI (gating de pantallas, menús) se
   * adapta a lo que ese usuario vería. Para saber quién es el administrador
   * real y mostrar el banner "Viendo como", ver `simulando`.
   */
  usuario: IdentidadConPermisos | null;
  cargando: boolean;
  /** Usuario que se está simulando, o `null` fuera de simulación. */
  simulando: SimulacionActual;
  login(nombreUsuario: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Activa "Ver como" (solo administradores) — refresca `usuario`/`simulando` al resolver. */
  verComo(usuarioId: string): Promise<void>;
  /** Termina la simulación activa — refresca `usuario`/`simulando` al resolver. */
  salirSimulacion(): Promise<void>;
}

const ContextoAuth = createContext<EstadoAuth | null>(null);

/**
 * Identidad de sesión para toda la SPA. Al montar, restaura la sesión
 * existente (si la cookie firmada sigue siendo válida) vía `auth.yo` —
 * evita pedir credenciales de nuevo en cada F5. `login`/`logout` delegan en
 * el router `auth` (Fase 3); la cookie de sesión la pone/quita el propio
 * servidor en la respuesta, aquí solo se refleja el estado resultante.
 */
export function AuthProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [usuario, setUsuario] = useState<IdentidadConPermisos | null>(null);
  const [simulando, setSimulando] = useState<SimulacionActual>(null);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async (): Promise<void> => {
    const [identidad, simulacion] = await Promise.all([
      trpcClient.auth.yo.query().catch(() => null),
      trpcClient.simulacion.actual.query().catch(() => null)
    ]);
    setUsuario(identidad);
    setSimulando(simulacion);
  }, []);

  useEffect(() => {
    void refrescar().finally(() => setCargando(false));
  }, [refrescar]);

  const login = useCallback(async (nombreUsuario: string, password: string): Promise<void> => {
    const identidad = await trpcClient.auth.login.mutate({ nombreUsuario, password });
    setUsuario(identidad);
    setSimulando(null);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await trpcClient.auth.logout.mutate();
    setUsuario(null);
    setSimulando(null);
  }, []);

  const verComo = useCallback(async (usuarioId: string): Promise<void> => {
    await trpcClient.simulacion.iniciar.mutate({ usuarioId });
    await refrescar();
  }, [refrescar]);

  const salirSimulacion = useCallback(async (): Promise<void> => {
    await trpcClient.simulacion.terminar.mutate();
    await refrescar();
  }, [refrescar]);

  return (
    <ContextoAuth.Provider value={{ usuario, cargando, simulando, login, logout, verComo, salirSimulacion }}>
      {children}
    </ContextoAuth.Provider>
  );
}

export function useAuth(): EstadoAuth {
  const ctx = useContext(ContextoAuth);
  if (!ctx) throw new Error('useAuth() debe usarse dentro de <AuthProvider>.');
  return ctx;
}
