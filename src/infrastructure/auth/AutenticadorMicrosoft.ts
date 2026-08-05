import { randomBytes, createHash } from 'node:crypto';
import { URL, URLSearchParams } from 'node:url';
import { BrowserWindow, safeStorage } from 'electron';
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
 * Campos esperados en `configuracion`, todos opcionales: `tenantId` (por
 * defecto "organizations"), `clienteId` (por defecto el cliente público que
 * Microsoft publica para este propósito — ver `CLIENTE_ID_PUBLICO_POR_DEFECTO`
 * más abajo, el mismo que usan herramientas como DAX Studio, Tabular Editor
 * o ALM Toolkit para no requerir que cada usuario registre su propia app en
 * Azure AD) y `scope` (por defecto se infiere del servidor: Power BI si es
 * un endpoint XMLA de Power BI, Azure Analysis Services si la URL contiene
 * "asazure.windows.net"). Solo hace falta llenarlos si la organización
 * exige una app registrada propia (p. ej. por una política de Conditional
 * Access que restringe qué clientes pueden autenticarse).
 */

const REDIRECT_URI = 'https://login.microsoftonline.com/common/oauth2/nativeclient';
const AUTORIDAD_POR_DEFECTO = 'https://login.microsoftonline.com';

/**
 * Client ID público (multi-tenant, sin secreto) que Microsoft publica para
 * clientes nativos que se conectan a Power BI/Azure Analysis Services —
 * ya tiene los permisos delegados necesarios preconsentidos, por lo que
 * cualquier aplicación puede usarlo para el flujo interactivo sin que el
 * usuario/organización tenga que registrar una app propia en Azure AD.
 * Es el mismo que usan DAX Studio, Tabular Editor y ALM Toolkit.
 */
const CLIENTE_ID_PUBLICO_POR_DEFECTO = '871c010f-5e61-4fb1-83ac-98610a7e9110';

const AMBITO_POWER_BI_POR_DEFECTO = 'https://analysis.windows.net/powerbi/api/.default offline_access';

function clienteId(cfg: Record<string, string>): string {
  return cfg.clienteId || CLIENTE_ID_PUBLICO_POR_DEFECTO;
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
    redirect_uri: REDIRECT_URI,
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
    throw new Error(datos.error_description || datos.error || `El servidor de token de Microsoft respondió ${respuesta.status}.`);
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
    redirect_uri: REDIRECT_URI,
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

function extraerRedireccion(url: string): { codigo?: string; error?: string; state?: string } {
  if (!url.startsWith(REDIRECT_URI)) return {};
  const q = new URL(url).searchParams;
  return {
    codigo: q.get('code') ?? undefined,
    error: q.get('error_description') ?? q.get('error') ?? undefined,
    state: q.get('state') ?? undefined
  };
}

/**
 * Abre una ventana emergente con la página de inicio de sesión de
 * Microsoft y espera a que el usuario la complete. Devuelve el código de
 * autorización una vez que Azure AD redirige a la URI de cliente nativo.
 * Requiere el proceso principal de Electron con una sesión humana real —
 * por eso queda fuera del alcance de las pruebas automatizadas (igual que
 * cualquier flujo de login interactivo de terceros).
 */
function iniciarSesionEnVentana(urlAutorizacion: string, stateEsperado: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ventana = new BrowserWindow({
      width: 500,
      height: 700,
      title: 'Iniciar sesión con Microsoft',
      autoHideMenuBar: true,
      webPreferences: { partition: 'persist:kpitracker-msal', nodeIntegration: false, contextIsolation: true }
    });

    let resuelta = false;
    const manejarUrl = (url: string): void => {
      const { codigo, error, state } = extraerRedireccion(url);
      if (!codigo && !error) return;
      if (resuelta) return;
      resuelta = true;
      if (state !== stateEsperado) {
        reject(new Error('La respuesta de Microsoft no coincide con la solicitud (state inválido).'));
      } else if (codigo) {
        resolve(codigo);
      } else {
        reject(new Error(error || 'Microsoft denegó el inicio de sesión.'));
      }
      ventana.close();
    };

    ventana.webContents.on('will-redirect', (_evento, url) => manejarUrl(url));
    ventana.webContents.on('will-navigate', (_evento, url) => manejarUrl(url));
    ventana.on('closed', () => {
      if (!resuelta) reject(new Error('Se cerró la ventana de inicio de sesión antes de completarlo.'));
    });

    ventana.loadURL(urlAutorizacion).catch((error: unknown) => {
      if (resuelta) return;
      resuelta = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

function cifrar(texto: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(texto).toString('base64')}`;
    }
  } catch {
    // Sin soporte de cifrado del sistema operativo: se guarda en claro como respaldo (ver descifrar()).
  }
  return `plano:${texto}`;
}

function descifrar(valor: string): string {
  if (valor.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(valor.slice(4), 'base64'));
  if (valor.startsWith('plano:')) return valor.slice(6);
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
  const codigo = await iniciarSesionEnVentana(url, state);
  const obtenido = await intercambiarCodigoPorToken(cfg, codigo, verifier);
  cache.set(clave, { accessToken: obtenido.accessToken, expiraEn: obtenido.expiraEn, refreshToken: obtenido.refreshToken });
  if (obtenido.refreshToken) await persistirRefreshToken(origen, obtenido.refreshToken, guardarOrigen);
  return obtenido.accessToken;
}
