import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch AX (pedido explícito del usuario) — fundación para operar la app
 * como SaaS multi-tenant: Workspaces, un catálogo de roles GLOBALES nuevo
 * (independiente de los roles workspace-scoped ya existentes desde Batch T)
 * y una pantalla dedicada para cambiar entre Workspaces. El admin sembrado
 * en el primer arranque ya nace con el rol global "Super administrador", así
 * que ve estas pantallas sin configuración adicional.
 *
 * Reorg posterior (pedido explícito del usuario): Workspaces/Roles globales
 * viven ahora bajo `Servicio > Administración` (submenú colapsable en el
 * sidebar, distinto de la Administración general en "Sistema"), y "Cambiar
 * workspace" es su propia página con lista de opciones + confirmar, en vez
 * del viejo `<select>` de pie de sidebar.
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

/** Abre el submenú "Servicio > Administración" si el enlace pedido no está ya visible. */
async function irAServicioAdministracion(testId: 'nav-servicio-workspaces' | 'nav-servicio-roles-globales'): Promise<void> {
  const enlace = pagina.getByTestId(testId);
  if (!(await enlace.isVisible())) {
    await pagina.getByTestId('nav-submenu-servicio-administracion').click();
  }
  await enlace.click();
}

async function cambiarWorkspaceA(nombre: string): Promise<void> {
  await pagina.getByTestId('nav-cambiar-workspace').click();
  await pagina.getByTestId(`cambiar-workspace-opcion-${nombre}`).click();
  await pagina.getByTestId('confirmar-cambiar-workspace').click();
  await expect(pagina).toHaveURL(/\/seguimiento$/);
}

test('Servicio > Administración > Workspaces muestra el workspace por defecto ("General")', async () => {
  await irAServicioAdministracion('nav-servicio-workspaces');
  await expect(pagina.getByTestId('workspace-General')).toBeVisible();
});

test('crear un workspace nuevo lo agrega a la tabla y aparece como opción en "Cambiar workspace"', async () => {
  await pagina.getByTestId('nuevo-workspace').click();
  await pagina.getByTestId('workspace-nombre').fill('Acme Corp');
  await pagina.getByTestId('guardar-workspace').click();
  await expect(pagina.getByTestId('workspace-Acme Corp')).toBeVisible();

  await pagina.getByTestId('nav-cambiar-workspace').click();
  await expect(pagina.getByTestId('cambiar-workspace-opcion-General')).toBeVisible();
  await expect(pagina.getByTestId('cambiar-workspace-opcion-Acme Corp')).toBeVisible();
});

test('un rol creado en "General" no existe en un workspace nuevo — catálogos de roles separados', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-rol-general').click();
  await pagina.getByTestId('rol-nombre').fill('Editor Acme');
  await pagina.getByTestId('guardar-rol').click();
  await expect(pagina.getByTestId('rol-Editor Acme')).toBeVisible();

  // Cambia al workspace nuevo (recién creado, sin ningún rol propio todavía).
  await cambiarWorkspaceA('Acme Corp');

  await pagina.getByTestId('nav-admin').click();
  await expect(pagina.getByTestId('rol-Editor Acme')).toHaveCount(0);
});

test('volver al workspace "General" (vía "Cambiar workspace") muestra de nuevo el rol "Editor Acme"', async () => {
  await cambiarWorkspaceA('General');

  await pagina.getByTestId('nav-admin').click();
  await expect(pagina.getByTestId('rol-Editor Acme')).toBeVisible();
});

test('el catálogo de "Roles globales" es independiente del de roles de workspace — crear uno lo agrega a su propia tabla', async () => {
  await irAServicioAdministracion('nav-servicio-roles-globales');
  await pagina.getByTestId('nuevo-rol-global').click();
  await pagina.getByTestId('rol-global-nombre').fill('Auditor de Workspaces');
  await pagina.getByTestId('rol-global-permiso-workspaces.crear').check();
  await pagina.getByTestId('guardar-rol-global').click();
  await expect(pagina.getByTestId('rol-global-Auditor de Workspaces')).toBeVisible();

  // No aparece entre los roles de workspace (son catálogos distintos, ver PoliticaPermisosGlobal.ts).
  await pagina.getByTestId('nav-admin').click();
  await expect(pagina.getByTestId('rol-Auditor de Workspaces')).toHaveCount(0);
});
