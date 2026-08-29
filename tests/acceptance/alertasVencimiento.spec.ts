import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch AL (pedido explícito del usuario): las alertas de indicadores
 * vencidos/próximos a vencer pasan de un banner fijo (siempre visible,
 * ocupando espacio en pantalla) a un icono de campanita con un badge
 * numérico — clic despliega un panel scrollable con el detalle.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('alertas-vencimiento');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('un indicador vencido (sin captura) muestra la campanita con badge "1"; el panel scrollable lo detalla al hacer clic', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador Vencido AL');
  await pagina.getByTestId('indicador-definicion').fill('Para probar la campanita de alertas (Batch AL).');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Mensual');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador Vencido AL')).toBeVisible();

  await pagina.getByTestId('nav-seguimiento').click();
  const campana = pagina.getByTestId('campana-vencimientos');
  await expect(campana).toBeVisible();
  await expect(campana.locator('.badge-campana')).toHaveText('1');
  await expect(pagina.getByTestId('panel-vencimientos')).toHaveCount(0);

  await pagina.getByTestId('campana-vencimientos').click();
  const panel = pagina.getByTestId('panel-vencimientos');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Indicador Vencido AL');

  // Clic afuera cierra el panel.
  await pagina.locator('body').click({ position: { x: 5, y: 5 } });
  await expect(panel).toHaveCount(0);
});
