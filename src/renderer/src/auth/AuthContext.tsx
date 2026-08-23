import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { trpcClient } from '../trpc';

/** Identidad + permisos efectivos (Batch T) — misma forma que devuelve `auth.yo`/`auth.login` en el servidor. */
export type IdentidadConPermisos = NonNullable<Awaited<ReturnType<typeof trpcClient.auth.yo.query>>>;

interface EstadoAuth {
  /** `null` mientras se restaura la sesión (`cargando: true`) o si no hay sesión válida. */
  usuario: IdentidadConPermisos | null;
  cargando: boolean;
  login(nombreUsuario: string, password: string): Promise<void>;
  logout(): Promise<void>;
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
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    trpcClient.auth.yo
      .query()
      .then(setUsuario)
      .catch(() => setUsuario(null))
      .finally(() => setCargando(false));
  }, []);

  const login = useCallback(async (nombreUsuario: string, password: string): Promise<void> => {
    const identidad = await trpcClient.auth.login.mutate({ nombreUsuario, password });
    setUsuario(identidad);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await trpcClient.auth.logout.mutate();
    setUsuario(null);
  }, []);

  return <ContextoAuth.Provider value={{ usuario, cargando, login, logout }}>{children}</ContextoAuth.Provider>;
}

export function useAuth(): EstadoAuth {
  const ctx = useContext(ContextoAuth);
  if (!ctx) throw new Error('useAuth() debe usarse dentro de <AuthProvider>.');
  return ctx;
}
