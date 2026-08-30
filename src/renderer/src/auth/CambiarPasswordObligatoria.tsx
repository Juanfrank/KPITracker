import { useState } from 'react';
import type { FormEvent } from 'react';
import { trpcClient } from '../trpc';
import { useAuth } from './AuthContext';

/**
 * Pantalla bloqueante (audit de seguridad, MEDIUM): se monta en vez de
 * `<Shell/>` (ver `RequireAuth`, `App.tsx`) mientras
 * `usuario.debeCambiarPassword` sea `true` — hoy, únicamente el
 * administrador sembrado en el primer arranque con la contraseña por
 * defecto "admin1234" (ver `asegurarAdminInicial`). El servidor rechaza
 * cualquier otra mutación mientras haya una credencial pendiente
 * (`protectedProcedure`, `trpc.ts`) — esta pantalla es la única salida
 * (además de cerrar sesión), y no un mero aviso: no hay forma de saltarla.
 */
export function CambiarPasswordObligatoria(): React.JSX.Element {
  const { usuario, logout, refrescar } = useAuth();
  const [passwordNueva, setPasswordNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!usuario) return;
    if (passwordNueva !== confirmacion) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      await trpcClient.usuarios.cambiarPassword.mutate({ id: usuario.id, passwordNueva });
      await refrescar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.');
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
        <p className="texto-suave" style={{ marginTop: 0 }}>
          Esta cuenta todavía usa la contraseña por defecto del primer arranque. Elija una nueva antes de continuar.
        </p>
        {error && <div className="aviso error" data-testid="cambiar-password-obligatoria-error">{error}</div>}
        <div className="campo">
          <label htmlFor="cpo-nueva">Contraseña nueva</label>
          <input
            id="cpo-nueva"
            type="password"
            value={passwordNueva}
            onChange={(e) => setPasswordNueva(e.target.value)}
            autoFocus
            autoComplete="new-password"
            data-testid="cambiar-password-obligatoria-nueva"
          />
        </div>
        <div className="campo">
          <label htmlFor="cpo-confirmacion">Confirmar contraseña</label>
          <input
            id="cpo-confirmacion"
            type="password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            autoComplete="new-password"
            data-testid="cambiar-password-obligatoria-confirmacion"
          />
        </div>
        <button className="boton primario" type="submit" disabled={enviando} data-testid="cambiar-password-obligatoria-enviar">
          {enviando ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
        <button className="boton sutil" type="button" onClick={() => void logout()} style={{ marginTop: 8 }}>
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
