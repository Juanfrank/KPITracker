import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch AX (pedido explícito del usuario) — fundación para operar la app
 * como SaaS multi-tenant: Workspaces, un catálogo de roles GLOBALES nuevo
 * (independiente de los roles workspace-scoped ya existentes desde Batch T)
 * y el selector para cambiar entre Workspaces. El admin sembrado en el
 * primer arranque ya nace con el rol global "Super administrador", así que
 * ve estas pantallas sin configuración adicional.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('workspaces');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('la pantalla Administración muestra "Workspaces" con el workspace por defecto ("General")', async () => {
  await pagina.getByTestId('nav-admin').click();
  await expect(pagina.getByTestId('workspace-General')).toBeVisible();
});

test('crear un workspace nuevo lo agrega a la tabla y al selector del sidebar', async () => {
  await pagina.getByTestId('nuevo-workspace').click();
  await pagina.getByTestId('workspace-nombre').fill('Acme Corp');
  await pagina.getByTestId('guardar-workspace').click();
  await expect(pagina.getByTestId('workspace-Acme Corp')).toBeVisible();

  // El selector del sidebar (montado una sola vez al abrir la sesión) recarga su lista de
  // workspaces en un F5 real — mismo criterio que cualquier catálogo cacheado del lado cliente.
  await pagina.reload();
  await pagina.getByTestId('nav-admin').click();

  // El admin (Super administrador) ve el selector de workspace en el sidebar.
  const selector = pagina.getByTestId('selector-workspace');
  await expect(selector).toBeVisible();
  await expect(selector.locator('option')).toHaveCount(2);
});

test('un rol creado en "General" no existe en un workspace nuevo — catálogos de roles separados', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-rol-general').click();
  await pagina.getByTestId('rol-nombre').fill('Editor Acme');
  await pagina.getByTestId('guardar-rol').click();
  await expect(pagina.getByTestId('rol-Editor Acme')).toBeVisible();

  // Cambia al workspace nuevo (recién creado, sin ningún rol propio todavía).
  await pagina.getByTestId('selector-workspace').selectOption({ label: 'Acme Corp' });
  await expect(pagina).toHaveURL(/\/seguimiento$/);

  await pagina.getByTestId('nav-admin').click();
  await expect(pagina.getByTestId('rol-Editor Acme')).toHaveCount(0);
});

test('volver al workspace "General" (vía el selector) muestra de nuevo el rol "Editor Acme"', async () => {
  await pagina.getByTestId('selector-workspace').selectOption({ label: 'General' });
  await expect(pagina).toHaveURL(/\/seguimiento$/);

  await pagina.getByTestId('nav-admin').click();
  await expect(pagina.getByTestId('rol-Editor Acme')).toBeVisible();
});

test('el catálogo de "Roles globales" es independiente del de roles de workspace — crear uno lo agrega a su propia tabla', async () => {
  await pagina.getByTestId('nuevo-rol-global').click();
  await pagina.getByTestId('rol-global-nombre').fill('Auditor de Workspaces');
  await pagina.getByTestId('rol-global-permiso-workspaces.crear').check();
  await pagina.getByTestId('guardar-rol-global').click();
  await expect(pagina.getByTestId('rol-global-Auditor de Workspaces')).toBeVisible();

  // No aparece entre los roles de workspace (son catálogos distintos, ver PoliticaPermisosGlobal.ts).
  await expect(pagina.getByTestId('rol-Auditor de Workspaces')).toHaveCount(0);
});
