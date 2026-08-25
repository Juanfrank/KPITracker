import { test, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { ADMIN_PASSWORD, ADMIN_USUARIO, abrirServidorWeb } from './fixtures';

/**
 * X1: un usuario sin ningún permiso (rol general/equipo por defecto, "que por
 * defecto no tiene nada habilitado") no debe ver en el sidebar, ni poder
 * navegar por URL directa, a los módulos de Configuración/Sistema que el
 * servidor de todos modos le rechazaría — solo Seguimiento/Recolección
 * (siempre visibles: la regla del responsable directo puede darle acceso a
 * indicadores puntuales sin depender de ningún rol) y Exportación/Acerca de
 * (sin gate de permiso alguno hoy).
 */

let admin: Page;
let baseUrl: string;
let cerrarApp: () => Promise<void>;
let browser: Browser;

const PASSWORD = 'sinPermisos123';

test.beforeAll(async () => {
  const servidor = await abrirServidorWeb('nav-gating');
  admin = servidor.pagina;
  baseUrl = servidor.baseUrl;
  cerrarApp = servidor.cerrar;
  browser = admin.context().browser()!;

  await admin.goto(baseUrl);
  await admin.getByTestId('login-usuario').fill(ADMIN_USUARIO);
  await admin.getByTestId('login-password').fill(ADMIN_PASSWORD);
  await admin.getByTestId('login-enviar').click();
  await admin.getByTestId('pagina-seguimiento').waitFor();
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('admin crea un usuario sin rol general ni rol de equipo (sin permisos)', async () => {
  await admin.getByTestId('nav-admin').click();
  await admin.getByTestId('nuevo-usuario').click();
  await admin.getByTestId('usuario-nombreUsuario').fill('raso');
  await admin.getByTestId('usuario-nombreCompleto').fill('Usuario Raso');
  await admin.getByTestId('usuario-password').fill(PASSWORD);
  await admin.getByTestId('guardar-usuario').click();
  await expect(admin.getByTestId('usuario-raso')).toBeVisible();
});

test('ese usuario solo ve Seguimiento/Recolección/Exportación/Acerca de en el sidebar', async () => {
  const contexto = await browser.newContext();
  const raso = await contexto.newPage();
  await raso.goto(baseUrl);
  await raso.getByTestId('login-usuario').fill('raso');
  await raso.getByTestId('login-password').fill(PASSWORD);
  await raso.getByTestId('login-enviar').click();
  await raso.getByTestId('pagina-seguimiento').waitFor();

  await expect(raso.getByTestId('nav-seguimiento')).toBeVisible();
  await expect(raso.getByTestId('nav-recoleccion')).toBeVisible();
  await expect(raso.getByTestId('nav-exportacion')).toBeVisible();
  await expect(raso.getByTestId('nav-acerca-de')).toBeVisible();

  for (const id of ['indicadores', 'configuracion-metas', 'atributos', 'listas', 'reglas', 'config-general', 'auditoria', 'admin']) {
    await expect(raso.getByTestId(`nav-${id}`)).toHaveCount(0);
  }

  // Navegación directa por URL a un módulo sin permiso redirige a Seguimiento en vez de mostrarlo.
  await raso.goto(`${baseUrl}/admin`);
  await raso.getByTestId('pagina-seguimiento').waitFor();
  await expect(raso).toHaveURL(/\/seguimiento$/);

  await contexto.close();
});
