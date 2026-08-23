import type { OrigenAutomatico } from '@domain/index';
import type { GuardarOrigen } from './AutenticadorMicrosoft';

const TIEMPO_TOKEN_MS = 15000;

interface TokenCacheado {
  token: string;
  expiraEn: number;
}

/** Cache de access tokens en memoria por origen, para no pedir uno nuevo en cada llamada. */
const cacheTokens = new Map<string, TokenCacheado>();

/**
 * Obtiene (y cachea) un access token OAuth2 vía el flujo Client Credentials
 * — el usado por Azure AD para Power BI Premium/Fabric (XMLA o REST) y
 * Azure Analysis Services en automatización app-únicamente (service
 * principal, sin usuario interactivo). Campos esperados en `configuracion`:
 * `tokenUrl`, `clienteId`, `clienteSecreto` y, opcionalmente, `scope` (p.
 * ej. "https://analysis.windows.net/powerbi/api/.default" para AAD v2, o se
 * puede usar `resource` en su lugar para endpoints AAD v1 vía `scope`).
 */
export async function obtenerTokenOAuth2(origen: OrigenAutomatico): Promise<string> {
  const cfg = origen.configuracion;
  if (!cfg.tokenUrl) throw new Error('Falta la URL del token (tokenUrl) para autenticación OAuth2.');
  if (!cfg.clienteId || !cfg.clienteSecreto) throw new Error('Faltan las credenciales OAuth2 (Client ID / Client Secret).');

  const claveCache = origen.id || cfg.tokenUrl;
  const cacheado = cacheTokens.get(claveCache);
  if (cacheado && cacheado.expiraEn > Date.now() + 5000) return cacheado.token;

  const parametros = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clienteId,
    client_secret: cfg.clienteSecreto
  });
  if (cfg.scope) parametros.set('scope', cfg.scope);

  const respuesta = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: parametros.toString(),
    signal: AbortSignal.timeout(TIEMPO_TOKEN_MS)
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error(`El servidor de token respondió ${respuesta.status}: ${texto.slice(0, 300)}`);

  let datos: { access_token?: string; expires_in?: number };
  try {
    datos = JSON.parse(texto) as { access_token?: string; expires_in?: number };
  } catch {
    throw new Error('La respuesta del servidor de token no es JSON válido.');
  }
  if (!datos.access_token) throw new Error('La respuesta del servidor de token no incluye "access_token".');

  cacheTokens.set(claveCache, { token: datos.access_token, expiraEn: Date.now() + (datos.expires_in ?? 3600) * 1000 });
  return datos.access_token;
}

/**
 * Cabecera `Authorization: Bearer ...` para APIs protegidas por Azure AD:
 * Microsoft (inicio de sesión interactivo, delegado) si está configurado, si
 * no OAuth2 Client Credentials (app-únicamente). Sin Basic — compartida por
 * conectores que solo aceptan tokens AAD (p. ej. la API REST de Power BI,
 * que a diferencia de un SSAS on-premise clásico nunca admite usuario/
 * contraseña). Devuelve `{}` si no hay autenticación configurada.
 */
export async function cabeceraBearer(origen: OrigenAutomatico, guardarOrigen?: GuardarOrigen): Promise<Record<string, string>> {
  const cfg = origen.configuracion;
  if (cfg.autenticacion === 'microsoft') {
    // Import diferido a propósito: `AutenticadorMicrosoft.ts` importa `electron`
    // (abre una `BrowserWindow` para el login interactivo) — cargarlo de forma
    // estática arrastraría `electron` a CUALQUIER proceso que importe este
    // módulo, incluido el servidor Express (que nunca puede mostrar una
    // ventana nativa). Solo se resuelve si de verdad se usa este modo.
    const { obtenerTokenMicrosoftInteractivo } = await import('./AutenticadorMicrosoft');
    const token = await obtenerTokenMicrosoftInteractivo(origen, guardarOrigen);
    return { Authorization: `Bearer ${token}` };
  }
  if (cfg.autenticacion === 'oauth2') {
    const token = await obtenerTokenOAuth2(origen);
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}
