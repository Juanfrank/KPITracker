import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Pantalla de login: sin equivalente en la app de escritorio (ver plan Fase 4 §9.3) — la app web es multi-usuario real. */
export function LoginPage(): React.JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const ubicacion = useLocation();
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destino = (ubicacion.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/seguimiento';

  const enviar = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await login(nombreUsuario, password);
      navigate(destino, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pantalla-login">
      <form className="tarjeta-login" onSubmit={(e) => void enviar(e)}>
        <div className="logo" style={{ padding: 0, marginBottom: 18 }}>
          KPI<span>Tracker</span>
        </div>
        {error && <div className="aviso error" data-testid="login-error">{error}</div>}
        <div className="campo">
          <label htmlFor="login-usuario">Usuario</label>
          <input
            id="login-usuario"
            type="text"
            value={nombreUsuario}
            onChange={(e) => setNombreUsuario(e.target.value)}
            autoFocus
            autoComplete="username"
            data-testid="login-usuario"
          />
        </div>
        <div className="campo">
          <label htmlFor="login-password">Contraseña</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            data-testid="login-password"
          />
        </div>
        <button className="boton primario" type="submit" disabled={enviando} data-testid="login-enviar">
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
