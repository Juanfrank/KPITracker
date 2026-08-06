import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import {
  generarPkce, construirUrlAutorizacion, intercambiarCodigoPorToken, renovarToken
} from '@infrastructure/auth/AutenticadorMicrosoft';

/**
 * Pruebas del inicio de sesión interactivo con Microsoft (Azure AD).
 *
 * Cubren, contra un servidor HTTP real y local (sin mocks, mismo enfoque
 * que el resto de la suite), todo lo que es mecánicamente testeable: PKCE,
 * la construcción de la URL de autorización, y el intercambio de código
 * y la renovación de token contra un endpoint de token real (apuntado vía
 * `configuracion.autoridad`, que en producción es
 * "https://login.microsoftonline.com" pero en las pruebas se sustituye por
 * el servidor local efímero).
 *
 * Lo que NO se puede probar de forma automatizada es la ventana emergente
 * de login en sí (`iniciarSesionEnVentana`): requiere el proceso principal
 * de Electron real y una sesión humana completando el formulario de
 * Microsoft — no hay forma de simularlo sin un navegador y una cuenta real,
 * igual que con cualquier flujo de OAuth2 interactivo de terceros.
 */

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('AutenticadorMicrosoft — PKCE y URL de autorización (puro, sin red)', () => {
  it('genera un par verifier/challenge que cumple PKCE S256 (RFC 7636)', () => {
    const { verifier, challenge } = generarPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(base64Url(createHash('sha256').update(verifier).digest()));
    // Sin caracteres no permitidos por base64url (sin +, /, =).
    expect(verifier).not.toMatch(/[+/=]/);
    expect(challenge).not.toMatch(/[+/=]/);
  });

  it('genera pares distintos en cada llamada', () => {
    const a = generarPkce();
    const b = generarPkce();
    expect(a.verifier).not.toBe(b.verifier);
  });

  it('construye la URL de autorización con tenant, scope, PKCE y la redirect_uri fija de cliente nativo', () => {
    const url = new URL(construirUrlAutorizacion(
      { tenantId: 'mi-tenant', clienteId: 'cid-123', scope: 'https://analysis.windows.net/powerbi/api/.default offline_access' },
      { state: 'estado-123', challenge: 'challenge-abc' }
    ));
    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/mi-tenant/oauth2/v2.0/authorize');
    expect(url.searchParams.get('client_id')).toBe('cid-123');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('https://login.microsoftonline.com/common/oauth2/nativeclient');
    expect(url.searchParams.get('code_challenge')).toBe('challenge-abc');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('estado-123');
    expect(url.searchParams.get('scope')).toContain('offline_access');
  });

  it('usa "organizations" como tenant por defecto cuando no se especifica tenantId', () => {
    const url = new URL(construirUrlAutorizacion({ clienteId: 'cid' }, { state: 's', challenge: 'c' }));
    expect(url.pathname).toContain('/organizations/');
  });

  it('usa el Client ID de Azure CLI como intento por defecto cuando no se especifica clienteId (no garantizado para todo tenant)', () => {
    const url = new URL(construirUrlAutorizacion({}, { state: 's', challenge: 'c' }));
    expect(url.searchParams.get('client_id')).toBe('04b07795-8ddb-461a-bbee-02f9e1bf7b46');
  });

  it('respeta un clienteId explícito por sobre el intento por defecto', () => {
    const url = new URL(construirUrlAutorizacion({ clienteId: 'app-propia-123' }, { state: 's', challenge: 'c' }));
    expect(url.searchParams.get('client_id')).toBe('app-propia-123');
  });

  it('usa la redirect URI de cliente nativo por defecto, salvo que se especifique redirectUri', () => {
    const porDefecto = new URL(construirUrlAutorizacion({}, { state: 's', challenge: 'c' }));
    expect(porDefecto.searchParams.get('redirect_uri')).toBe('https://login.microsoftonline.com/common/oauth2/nativeclient');

    const personalizada = new URL(construirUrlAutorizacion(
      { redirectUri: 'https://miapp.ejemplo.com/callback' }, { state: 's', challenge: 'c' }
    ));
    expect(personalizada.searchParams.get('redirect_uri')).toBe('https://miapp.ejemplo.com/callback');
  });

  it('infiere el scope de Power BI por defecto cuando no hay servidor Azure Analysis Services', () => {
    const url = new URL(construirUrlAutorizacion(
      { servidor: 'powerbi://api.powerbi.com/v1.0/myorg/MiWorkspace' },
      { state: 's', challenge: 'c' }
    ));
    expect(url.searchParams.get('scope')).toBe('https://analysis.windows.net/powerbi/api/.default offline_access');
  });

  it('infiere el scope del recurso de Azure Analysis Services a partir de la URL del servidor', () => {
    const url = new URL(construirUrlAutorizacion(
      { servidor: 'https://southcentralus.asazure.windows.net/servers/miservidor' },
      { state: 's', challenge: 'c' }
    ));
    expect(url.searchParams.get('scope')).toBe('https://southcentralus.asazure.windows.net/user_impersonation offline_access');
  });

  it('respeta un scope explícito por sobre el inferido del servidor', () => {
    const url = new URL(construirUrlAutorizacion(
      { servidor: 'https://southcentralus.asazure.windows.net/servers/miservidor', scope: 'scope-personalizado' },
      { state: 's', challenge: 'c' }
    ));
    expect(url.searchParams.get('scope')).toBe('scope-personalizado');
  });
});

describe('AutenticadorMicrosoft — intercambio y renovación de token (servidor real local)', () => {
  it('intercambia un código de autorización por access/refresh token vía POST real al endpoint de token', async () => {
    let cuerpoRecibido = '';
    const servidor = createServer((req, res) => {
      const trozos: Buffer[] = [];
      req.on('data', (d) => trozos.push(d));
      req.on('end', () => {
        cuerpoRecibido = Buffer.concat(trozos).toString('utf-8');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ access_token: 'token-abc', refresh_token: 'refresh-xyz', expires_in: 3600 }));
      });
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
    try {
      const cfg = { clienteId: 'cid-1', tenantId: 't1', autoridad: `http://127.0.0.1:${puerto}` };
      const resultado = await intercambiarCodigoPorToken(cfg, 'codigo-de-auth', 'verifier-xyz');

      expect(resultado.accessToken).toBe('token-abc');
      expect(resultado.refreshToken).toBe('refresh-xyz');
      expect(resultado.expiraEn).toBeGreaterThan(Date.now());

      const parametros = new URLSearchParams(cuerpoRecibido);
      expect(parametros.get('grant_type')).toBe('authorization_code');
      expect(parametros.get('code')).toBe('codigo-de-auth');
      expect(parametros.get('code_verifier')).toBe('verifier-xyz');
      expect(parametros.get('client_id')).toBe('cid-1');
      expect(parametros.get('redirect_uri')).toBe('https://login.microsoftonline.com/common/oauth2/nativeclient');
    } finally {
      servidor.close();
    }
  });

  it('un error AADSTS50011 (redirect URI no registrada) se propaga con una pista accionable sobre registrar una app propia', async () => {
    const servidor = createServer((req, res) => {
      req.on('data', () => {});
      req.on('end', () => {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: 'invalid_request',
          error_description: "AADSTS50011: The redirect URI 'https://login.microsoftonline.com/common/oauth2/nativeclient' specified in the request does not match the redirect URIs configured for the application."
        }));
      });
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
    try {
      const cfg = { autoridad: `http://127.0.0.1:${puerto}` };
      await expect(intercambiarCodigoPorToken(cfg, 'codigo', 'verifier')).rejects.toThrow(/AADSTS50011/);
      await expect(intercambiarCodigoPorToken(cfg, 'codigo', 'verifier')).rejects.toThrow(/Client ID/);
    } finally {
      servidor.close();
    }
  });

  it('un error del endpoint de token (código inválido) se propaga con el mensaje de Azure AD', async () => {
    const servidor = createServer((req, res) => {
      req.on('data', () => {});
      req.on('end', () => {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'AADSTS70000: código inválido o vencido.' }));
      });
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
    try {
      const cfg = { clienteId: 'cid-1', autoridad: `http://127.0.0.1:${puerto}` };
      await expect(intercambiarCodigoPorToken(cfg, 'codigo-malo', 'verifier')).rejects.toThrow(/AADSTS70000/);
    } finally {
      servidor.close();
    }
  });

  it('renueva el access token con el refresh token, sin pasar por el login interactivo', async () => {
    let cuerpoRecibido = '';
    const servidor = createServer((req, res) => {
      const trozos: Buffer[] = [];
      req.on('data', (d) => trozos.push(d));
      req.on('end', () => {
        cuerpoRecibido = Buffer.concat(trozos).toString('utf-8');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ access_token: 'token-renovado', refresh_token: 'refresh-nuevo', expires_in: 3600 }));
      });
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
    try {
      const cfg = { clienteId: 'cid-1', autoridad: `http://127.0.0.1:${puerto}` };
      const resultado = await renovarToken(cfg, 'refresh-viejo');

      expect(resultado.accessToken).toBe('token-renovado');
      expect(resultado.refreshToken).toBe('refresh-nuevo');

      const parametros = new URLSearchParams(cuerpoRecibido);
      expect(parametros.get('grant_type')).toBe('refresh_token');
      expect(parametros.get('refresh_token')).toBe('refresh-viejo');
    } finally {
      servidor.close();
    }
  });

  it('un refresh token vencido/revocado se propaga como error claro', async () => {
    const servidor = createServer((req, res) => {
      req.on('data', () => {});
      req.on('end', () => {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'AADSTS700082: refresh token vencido.' }));
      });
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
    try {
      const cfg = { clienteId: 'cid-1', autoridad: `http://127.0.0.1:${puerto}` };
      await expect(renovarToken(cfg, 'refresh-vencido')).rejects.toThrow(/vencido/);
    } finally {
      servidor.close();
    }
  });
});
