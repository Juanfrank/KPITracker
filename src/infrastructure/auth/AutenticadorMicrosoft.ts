import { randomBytes, createHash } from 'node:crypto';
import { URL, URLSearchParams } from 'node:url';
import type { OrigenAutomatico } from '@domain/index';

/**
 * Inicio de sesión interactivo con Microsoft (Azure AD / Entra ID) para
 * orígenes XMLA que apuntan a Power BI Premium/Fabric o Azure Analysis
 * Services con permisos delegados: el usuario inicia sesión con su propia
 * cuenta (a diferencia del flujo Client Credentials de app-únicamente que
 * ya soporta `autenticacion: 'oauth2'`).
 *
 * Implementa Authorization Code + PKCE (RFC 7636), el flujo que Microsoft
 * recomienda para aplicaciones nativas/de escritorio (cliente público, sin
 * client secret). El login ocurre en una ventana emergente de Electron;
 * Azure AD redirige a la URI fija que Microsoft reserva para clientes
 * nativos (`.../oauth2/nativeclient`), que la ventana intercepta sin
 * necesitar levantar un servidor HTTP local.
 *
 * Campos esperados en `configuracion`: `clienteId` es, en la práctica,
 * obligatorio — ver la nota debajo sobre `CLIENTE_ID_INTENTO_POR_DEFECTO`.
 * `tenantId` (por defecto "organizations"), `scope` (por defecto se infiere
 * del servidor: Power BI si es un endpoint XMLA de Power BI, Azure Analysis
 * Services si la URL contiene "asazure.windows.net") y `redirectUri` (por
 * defecto la URI fija que Azure AD ofrece para clientes nativos, ver
 * REDIRECT_URI_POR_DEFECTO) son opcionales.
 *
 * Sobre el Client ID: Azure AD exige que la redirect URI usada en el login
 * esté registrada explícitamente en la app de Azure AD correspondiente al
 * Client ID — no existe un "cliente público universal" preconfigurado con
 * cualquier redirect URI que a uno se le ocurra usar. Lo más confiable es
 * que cada organización registre su propia app (gratis, ~5 minutos en Azure
 * Portal → Registros de aplicaciones → Nueva → plataforma "Aplicaciones
 * móviles y de escritorio" → agregar la redirect URI sugerida
 * "https://login.microsoftonline.com/common/oauth2/nativeclient" → en API
 * permissions agregar Power BI Service o Azure Analysis Services con el
 * scope user_impersonation/delegado y dar consentimiento). Como intento
 * best-effort cuando no se especifica un Client ID, se usa el de Azure CLI
 * (ver abajo) porque suele tener registradas varias redirect URIs comunes,
 * pero NO está garantizado para todos los tenants (algunas organizaciones
 * lo bloquean por política): si falla con "AADSTS50011" u otro error de
 * consentimiento/registro, hay que registrar una app propia.
 */

const REDIRECT_URI_POR_DEFECTO = 'https://login.microsoftonline.com/common/oauth2/nativeclient';
const AUTORIDAD_POR_DEFECTO = 'https://login.microsoftonline.com';

/**
 * Client ID de "Microsoft Azure CLI", un cliente público y multi-tenant que
 * suele tener registradas varias redirect URIs comunes (incluida la que
 * usamos por defecto) y por eso se reutiliza informalmente en herramientas
 * de terceros para evitar pedirle a cada usuario que registre su propia
 * app. Es solo un punto de partida, NO una garantía: cada tenant puede
 * restringirlo, y Azure Analysis Services/Power BI pueden requerir un
 * consentimiento de permisos que este cliente no tenga. Si falla, el
 * camino confiable es registrar una app propia (ver el comentario de
 * arriba) y completar el campo Client ID explícitamente.
 */
const CLIENTE_ID_INTENTO_POR_DEFECTO = '04b07795-8ddb-461a-bbee-02f9e1bf7b46';

const AMBITO_POWER_BI_POR_DEFECTO = 'https://analysis.windows.net/powerbi/api/.default offline_access';

function clienteId(cfg: Record<string, string>): string {
  return cfg.clienteId || CLIENTE_ID_INTENTO_POR_DEFECTO;
}

function redirectUri(cfg: Record<string, string>): string {
  return cfg.redirectUri || REDIRECT_URI_POR_DEFECTO;
}

/**
 * Scope por defecto cuando el usuario no especifica uno: se infiere del
 * servidor XMLA configurado — Azure Analysis Services (`*.asazure.windows.net`)
 * requiere el recurso exacto del servidor; cualquier otro caso (Power BI
 * Premium/Fabric) usa el scope de la API de Power BI.
 */
function ambitoPorDefecto(cfg: Record<string, string>): string {
  const servidor = cfg.servidor;
  if (servidor && /\.asazure\.windows\.net/i.test(servidor)) {
    try {
      return `${new URL(servidor).origin}/user_impersonation offline_access`;
    } catch {
      // URL de servidor no válida: sigue al scope de Power BI por defecto.
    }
  }
  return AMBITO_POWER_BI_POR_DEFECTO;
}

interface TokenCacheado {
  accessToken: string;
  expiraEn: number;
  refreshToken?: string;
}

/** Caché de tokens en memoria por origen — evita reabrir la ventana de login en cada llamada de la misma sesión. */
const cache = new Map<string, TokenCacheado>();

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Genera el par verifier/challenge de PKCE (RFC 7636) para el flujo Authorization Code. */
export function generarPkce(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function autoridad(cfg: Record<string, string>): string {
  return (cfg.autoridad || AUTORIDAD_POR_DEFECTO).replace(/\/$/, '');
}

function tenant(cfg: Record<string, string>): string {
  return cfg.tenantId || 'organizations';
}

/** Construye la URL de autorización de Azure AD (v2.0) para el flujo interactivo. */
export function construirUrlAutorizacion(cfg: Record<string, string>, opciones: { state: string; challenge: string }): string {
  const parametros = new URLSearchParams({
    client_id: clienteId(cfg),
    response_type: 'code',
    redirect_uri: redirectUri(cfg),
    response_mode: 'query',
    scope: cfg.scope || ambitoPorDefecto(cfg),
    state: opciones.state,
    code_challenge: opciones.challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });
  return `${autoridad(cfg)}/${tenant(cfg)}/oauth2/v2.0/authorize?${parametros.toString()}`;
}

interface RespuestaToken {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenObtenido {
  accessToken: string;
  refreshToken?: string;
  expiraEn: number;
}

/** Añade una pista accionable a errores de Azure AD conocidos por su código AADSTS. */
function mensajeAmigable(mensaje: string): string {
  if (/AADSTS50011/.test(mensaje)) {
    return `${mensaje} — la redirect URI no está registrada en esta app de Azure AD. Complete el campo "Client ID" con una app propia registrada en Azure Portal (plataforma "Aplicaciones móviles y de escritorio") con la redirect URI "${REDIRECT_URI_POR_DEFECTO}" (o complete "redirectUri" con la que haya registrado).`;
  }
  if (/AADSTS700016/.test(mensaje)) {
    return `${mensaje} — la app de Client ID configurado no existe en este tenant. Complete el campo "Client ID" con una app propia registrada en Azure Portal para este tenant.`;
  }
  if (/AADSTS65001/.test(mensaje)) {
    return `${mensaje} — falta consentimiento para los permisos solicitados. Si usa una app propia, agregue el permiso de Power BI Service o Azure Analysis Services (delegado, user_impersonation) y dé consentimiento en Azure Portal.`;
  }
  return mensaje;
}

async function pedirToken(cfg: Record<string, string>, cuerpo: URLSearchParams): Promise<TokenObtenido> {
  const url = `${autoridad(cfg)}/${tenant(cfg)}/oauth2/v2.0/token`;
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: cuerpo.toString()
  });
  const texto = await respuesta.text();
  let datos: RespuestaToken;
  try {
    datos = JSON.parse(texto) as RespuestaToken;
  } catch {
    throw new Error('La respuesta del servidor de token de Microsoft no es JSON válido.');
  }
  if (!respuesta.ok || !datos.access_token) {
    throw new Error(mensajeAmigable(datos.error_description || datos.error || `El servidor de token de Microsoft respondió ${respuesta.status}.`));
  }
  return {
    accessToken: datos.access_token,
    refreshToken: datos.refresh_token,
    expiraEn: Date.now() + (datos.expires_in ?? 3600) * 1000
  };
}

/** Intercambia el código de autorización (con su code_verifier de PKCE) por un access/refresh token. */
export function intercambiarCodigoPorToken(cfg: Record<string, string>, codigo: string, verifier: string): Promise<TokenObtenido> {
  const cuerpo = new URLSearchParams({
    client_id: clienteId(cfg),
    grant_type: 'authorization_code',
    code: codigo,
    redirect_uri: redirectUri(cfg),
    code_verifier: verifier,
    scope: cfg.scope || ambitoPorDefecto(cfg)
  });
  return pedirToken(cfg, cuerpo);
}

/** Renueva un access token vencido usando el refresh token, sin volver a mostrar la ventana de inicio de sesión. */
export function renovarToken(cfg: Record<string, string>, refreshToken: string): Promise<TokenObtenido> {
  const cuerpo = new URLSearchParams({
    client_id: clienteId(cfg),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: cfg.scope || ambitoPorDefecto(cfg)
  });
  return pedirToken(cfg, cuerpo);
}

/** Sin caller hoy (la ventana de Electron que la usaba se retiró en la Fase 4) — se conserva exportada para el futuro flujo de redirección del servidor, ver `iniciarSesionEnVentana`. */
export function extraerRedireccion(url: string, redirectUriEsperada: string): { codigo?: string; error?: string; state?: string } {
  if (!url.startsWith(redirectUriEsperada)) return {};
  const q = new URL(url).searchParams;
  return {
    codigo: q.get('code') ?? undefined,
    error: q.get('error_description') ?? q.get('error') ?? undefined,
    state: q.get('state') ?? undefined
  };
}

/**
 * En la app de escritorio esto abría una `BrowserWindow` de Electron con la
 * página de login de Microsoft y esperaba la redirección a `redirectUri`
 * para capturar el código de autorización. Sin proceso Electron (Fase 4:
 * retiro del escritorio), no hay ventana nativa que abrir — un rediseño
 * real requiere un flujo de redirección del lado del servidor (una ruta
 * REST que redirija al navegador a Azure AD + una ruta de callback que
 * reciba el `code`), que es trabajo nuevo, no una migración de transporte,
 * y queda fuera del alcance de la Fase 4 (`extraerRedireccion`/
 * `construirUrlAutorizacion`/`intercambiarCodigoPorToken` de arriba ya son
 * exactamente las piezas que ese flujo reutilizaría). Hasta entonces, el
 * modo `autenticacion: 'microsoft'` sigue configurable en la UI (Admin) —
 * intencionalmente, para no perder la configuración guardada — pero
 * `probar`/`ejecutar` sobre un origen que lo usa falla con este mensaje en
 * vez de colgarse; `autenticacion: 'oauth2'` (Client Credentials,
 * app-únicamente) sigue funcionando sin cambios como alternativa no
 * interactiva.
 */
function iniciarSesionEnVentana(_urlAutorizacion: string, _stateEsperado: string, _redirectUriEsperada: string): Promise<string> {
  return Promise.reject(
    new Error(
      'El inicio de sesión interactivo con Microsoft no está disponible en esta versión web (requería una ventana nativa de Electron, retirada en la Fase 4). Use "OAuth2 (Client Credentials, app-únicamente)" en su lugar, o contacte al equipo para priorizar el flujo de redirección del lado del servidor.'
    )
  );
}

/**
 * El cifrado con `safeStorage` (claves del sistema operativo, vía Electron)
 * tampoco tiene equivalente en un proceso de servidor sin ventana — se
 * guarda el refresh token en el mismo formato "plano:" que ya usaba como
 * respaldo cuando `safeStorage` no estaba disponible (comportamiento ya
 * probado, solo que ahora es el único camino). Brecha de seguridad
 * disclosed, no de esta fase: un cifrado real del lado del servidor
 * (clave simétrica en variable de entorno) es trabajo futuro.
 */
function cifrar(texto: string): string {
  return `plano:${texto}`;
}

function descifrar(valor: string): string {
  if (valor.startsWith('plano:')) return valor.slice(6);
  if (valor.startsWith('enc:')) throw new Error('Refresh token cifrado con safeStorage de una instalación de escritorio anterior — vuelva a iniciar sesión.');
  return valor;
}

export type GuardarOrigen = (origen: OrigenAutomatico) => Promise<void>;

async function persistirRefreshToken(origen: OrigenAutomatico, refreshToken: string, guardarOrigen?: GuardarOrigen): Promise<void> {
  if (!guardarOrigen || !origen.id) return; // Origen sin guardar aún: la sesión queda solo en memoria hasta que se guarde.
  const cifrado = cifrar(refreshToken);
  if (origen.configuracion.refreshTokenCifrado === cifrado) return;
  await guardarOrigen({ ...origen, configuracion: { ...origen.configuracion, refreshTokenCifrado: cifrado } });
}

/**
 * Resuelve un access token para autenticación interactiva con Microsoft:
 * 1) reutiliza el de la caché en memoria si sigue vigente;
 * 2) si no, intenta renovarlo en silencio con el refresh token (en caché o
 *    persistido cifrado en `configuracion.refreshTokenCifrado`);
 * 3) solo si ninguno de los dos aplica (primera vez, o el refresh token
 *    venció/fue revocado), abre la ventana de inicio de sesión.
 */
export async function obtenerTokenMicrosoftInteractivo(origen: OrigenAutomatico, guardarOrigen?: GuardarOrigen): Promise<string> {
  const cfg = origen.configuracion;
  const clave = origen.id || clienteId(cfg);

  const enCache = cache.get(clave);
  if (enCache && enCache.expiraEn > Date.now() + 5000) return enCache.accessToken;

  const refreshTokenGuardado = enCache?.refreshToken || (cfg.refreshTokenCifrado ? descifrar(cfg.refreshTokenCifrado) : undefined);
  if (refreshTokenGuardado) {
    try {
      const renovado = await renovarToken(cfg, refreshTokenGuardado);
      const refreshToken = renovado.refreshToken || refreshTokenGuardado;
      cache.set(clave, { accessToken: renovado.accessToken, expiraEn: renovado.expiraEn, refreshToken });
      await persistirRefreshToken(origen, refreshToken, guardarOrigen);
      return renovado.accessToken;
    } catch {
      // El refresh token venció o fue revocado: seguimos al login interactivo.
    }
  }

  const { verifier, challenge } = generarPkce();
  const state = base64Url(randomBytes(16));
  const url = construirUrlAutorizacion(cfg, { state, challenge });
  const codigo = await iniciarSesionEnVentana(url, state, redirectUri(cfg));
  const obtenido = await intercambiarCodigoPorToken(cfg, codigo, verifier);
  cache.set(clave, { accessToken: obtenido.accessToken, expiraEn: obtenido.expiraEn, refreshToken: obtenido.refreshToken });
  if (obtenido.refreshToken) await persistirRefreshToken(origen, obtenido.refreshToken, guardarOrigen);
  return obtenido.accessToken;
}
