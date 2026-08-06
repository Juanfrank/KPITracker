import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Prueba de aceptación del borrado lógico (Batch M): un responsable en uso
 * no puede eliminarse (el aviso muestra qué indicador lo usa); una vez
 * desasignado, eliminarlo lo oculta de la lista; "Mostrar eliminados" lo
 * revela atenuado, y "Restaurar" lo devuelve a la lista normal.
 */

let aplicacion: ElectronApplication;
let pagina: Page;
let dataDir: string;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-e2e-borrado-logico-'));
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

test('un responsable asignado a un indicador no puede eliminarse; el aviso indica cuál lo usa', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-responsable').click();
  await pagina.getByTestId('responsable-nombre').fill('Responsable eliminable');
  await pagina.getByTestId('guardar-responsable').click();
  await expect(pagina.getByTestId('responsable-Responsable eliminable')).toBeVisible();

  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador con responsable');
  await pagina.getByTestId('indicador-definicion').fill('Indicador de prueba para borrado lógico.');
  await pagina.getByTestId('indicador-responsable').selectOption({ label: 'Responsable eliminable' });
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador con responsable')).toBeVisible();

  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('responsable-Responsable eliminable').click();
  await pagina.getByRole('button', { name: 'Eliminar' }).click();
  const error = pagina.getByTestId('responsable-error-eliminar');
  await expect(error).toBeVisible();
  await expect(error).toContainText('Indicador con responsable');
  await pagina.getByRole('button', { name: 'Cancelar' }).click();
});

test('desasignado, eliminar oculta al responsable; "Mostrar eliminados" lo revela y "Restaurar" lo devuelve', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('indicador-Indicador con responsable').click();
  await pagina.getByTestId('indicador-responsable').selectOption({ label: '— sin asignar —' });
  await pagina.getByTestId('guardar-indicador').click();

  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('responsable-Responsable eliminable').click();
  await pagina.getByRole('button', { name: 'Eliminar' }).click();
  await expect(pagina.getByTestId('responsable-Responsable eliminable')).toHaveCount(0);

  await pagina.getByTestId('responsables-mostrar-eliminados').check();
  const fila = pagina.getByTestId('responsable-Responsable eliminable');
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('Eliminado');

  await fila.getByRole('button', { name: 'Restaurar' }).click();
  await pagina.getByTestId('responsables-mostrar-eliminados').uncheck();
  await expect(pagina.getByTestId('responsable-Responsable eliminable')).toBeVisible();
});
