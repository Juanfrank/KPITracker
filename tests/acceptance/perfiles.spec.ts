import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Prueba de aceptación del Sistema de Perfiles (Batch P): arranque limpio
 * migra a un perfil "Predeterminado"; crear/renombrar/eliminar perfiles;
 * cambiar de perfil aísla los datos (recarga completa de la página, ya que
 * no hay invalidación central de estado). El diálogo nativo de
 * guardado/apertura de archivo no es automatizable con Playwright — el
 * flujo de respaldo/importación se cubre por integración
 * (`tests/integration/respaldo.test.ts`); aquí solo se confirma que los
 * botones existen.
 */

let aplicacion: ElectronApplication;
let pagina: Page;
let dataDir: string;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-e2e-perfiles-'));
  aplicacion = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, KPITRACKER_DATA_DIR: dataDir, ELECTRON_DISABLE_SANDBOX: '1' }
  });
  pagina = await aplicacion.firstWindow();
  await pagina.setViewportSize({ width: 1440, height: 900 });
  await pagina.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await aplicacion.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test.describe.configure({ mode: 'serial' });

/** Tras `perfiles:cambiar` la página se recarga por completo (sin invalidación central de estado). */
async function esperarRecarga(): Promise<void> {
  await pagina.waitForLoadState('domcontentloaded');
  await pagina.waitForTimeout(300);
}

test('el arranque limpio migra a un único perfil "Predeterminado", activo', async () => {
  await pagina.getByTestId('nav-perfiles').click();
  const fila = pagina.getByTestId('perfil-Predeterminado');
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('Activo');
});

test('crear el perfil "Pruebas" y cambiarse a él aísla los datos (recarga)', async () => {
  await pagina.getByTestId('nuevo-perfil').click();
  await pagina.getByTestId('perfil-nombre').fill('Pruebas');
  await pagina.getByTestId('guardar-perfil').click();
  await expect(pagina.getByTestId('perfil-Pruebas')).toBeVisible();

  await pagina.getByTestId('perfil-Pruebas').getByRole('button', { name: 'Usar' }).click();
  await esperarRecarga();

  await pagina.getByTestId('nav-indicadores').click();
  await expect(pagina.getByTestId('nuevo-indicador')).toBeVisible();

  await pagina.getByTestId('nav-perfiles').click();
  await expect(pagina.getByTestId('perfil-Pruebas')).toContainText('Activo');
});

test('un indicador creado en "Pruebas" no aparece en "Predeterminado" y reaparece al volver', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador de Pruebas');
  await pagina.getByTestId('indicador-definicion').fill('Solo existe en el perfil Pruebas.');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador de Pruebas')).toBeVisible();

  await pagina.getByTestId('nav-perfiles').click();
  await pagina.getByTestId('perfil-Predeterminado').getByRole('button', { name: 'Usar' }).click();
  await esperarRecarga();

  await pagina.getByTestId('nav-indicadores').click();
  await expect(pagina.getByTestId('indicador-Indicador de Pruebas')).toHaveCount(0);

  await pagina.getByTestId('nav-perfiles').click();
  await pagina.getByTestId('perfil-Pruebas').getByRole('button', { name: 'Usar' }).click();
  await esperarRecarga();

  await pagina.getByTestId('nav-indicadores').click();
  await expect(pagina.getByTestId('indicador-Indicador de Pruebas')).toBeVisible();
});

test('renombrar un perfil no pierde sus datos', async () => {
  await pagina.getByTestId('nav-perfiles').click();
  await pagina.getByTestId('perfil-Pruebas').click();
  await pagina.getByTestId('perfil-nombre').fill('Pruebas renombrado');
  await pagina.getByTestId('guardar-perfil').click();
  await expect(pagina.getByTestId('perfil-Pruebas renombrado')).toBeVisible();

  await pagina.getByTestId('nav-indicadores').click();
  await expect(pagina.getByTestId('indicador-Indicador de Pruebas')).toBeVisible();
});

test('eliminar el perfil activo se rechaza con un mensaje claro', async () => {
  await pagina.getByTestId('nav-perfiles').click();
  await pagina.getByTestId('perfil-Pruebas renombrado').click(); // es el activo en este punto
  await pagina.getByRole('button', { name: 'Eliminar' }).click();
  await pagina.getByTestId('perfil-confirmar-nombre').fill('Pruebas renombrado');
  await pagina.getByTestId('confirmar-eliminar-perfil').click();
  await expect(pagina.getByText('No se puede eliminar el perfil activo')).toBeVisible();
  await pagina.getByRole('button', { name: 'Cerrar panel' }).click();
});

test('eliminar con confirmación por nombre exacto funciona', async () => {
  await pagina.getByTestId('nav-perfiles').click();
  await pagina.getByTestId('perfil-Predeterminado').getByRole('button', { name: 'Usar' }).click();
  await esperarRecarga();

  await pagina.getByTestId('nav-perfiles').click();
  await pagina.getByTestId('perfil-Pruebas renombrado').click();
  await pagina.getByRole('button', { name: 'Eliminar' }).click();
  // Nombre incorrecto: el botón permanece deshabilitado.
  await pagina.getByTestId('perfil-confirmar-nombre').fill('nombre incorrecto');
  await expect(pagina.getByTestId('confirmar-eliminar-perfil')).toBeDisabled();

  await pagina.getByTestId('perfil-confirmar-nombre').fill('Pruebas renombrado');
  await expect(pagina.getByTestId('confirmar-eliminar-perfil')).toBeEnabled();
  await pagina.getByTestId('confirmar-eliminar-perfil').click();
  await expect(pagina.getByTestId('perfil-Pruebas renombrado')).toHaveCount(0);
});

test('los botones de respaldo/importación están disponibles en la página de Perfiles', async () => {
  await pagina.getByTestId('nav-perfiles').click();
  await expect(pagina.getByTestId('exportar-respaldo')).toBeVisible();
  await expect(pagina.getByTestId('importar-respaldo')).toBeVisible();
});
