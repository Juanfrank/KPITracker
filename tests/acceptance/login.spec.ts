import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ADMIN_PASSWORD, ADMIN_USUARIO, abrirServidorWeb } from './fixtures';

/**
 * Autenticación (Fase 4, sin equivalente en la app de escritorio, que no
 * tenía login): credenciales correctas/incorrectas, redirect a `/login` sin
 * sesión, sesión persiste tras recargar, y logout.
 */

let pagina: Page;
let baseUrl: string;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const servidor = await abrirServidorWeb('login');
  pagina = servidor.pagina;
  baseUrl = servidor.baseUrl;
  cerrarApp = servidor.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('sin sesión, cualquier ruta redirige a /login', async () => {
  await pagina.goto(`${baseUrl}/seguimiento`);
  await expect(pagina).toHaveURL(/\/login$/);
  await expect(pagina.getByTestId('login-usuario')).toBeVisible();
});

test('credenciales incorrectas muestran un error y no navegan', async () => {
  await pagina.getByTestId('login-usuario').fill(ADMIN_USUARIO);
  await pagina.getByTestId('login-password').fill('contraseña-incorrecta');
  await pagina.getByTestId('login-enviar').click();
  await expect(pagina.getByTestId('login-error')).toBeVisible();
  await expect(pagina).toHaveURL(/\/login$/);
});

test('credenciales correctas inician sesión y redirigen a la ruta pedida originalmente', async () => {
  await pagina.getByTestId('login-usuario').fill(ADMIN_USUARIO);
  await pagina.getByTestId('login-password').fill(ADMIN_PASSWORD);
  await pagina.getByTestId('login-enviar').click();
  await expect(pagina).toHaveURL(/\/seguimiento$/);
  await expect(pagina.getByTestId('pagina-seguimiento')).toBeVisible();
});

test('la sesión persiste tras recargar la página (cookie de sesión)', async () => {
  await pagina.reload();
  await expect(pagina).toHaveURL(/\/seguimiento$/);
  await expect(pagina.getByTestId('pagina-seguimiento')).toBeVisible();
});

test('cerrar sesión vuelve a /login y una ruta protegida ya no es accesible', async () => {
  await pagina.getByTestId('cerrar-sesion').click();
  await expect(pagina).toHaveURL(/\/login$/);
  await pagina.goto(`${baseUrl}/seguimiento`);
  await expect(pagina).toHaveURL(/\/login$/);
});
