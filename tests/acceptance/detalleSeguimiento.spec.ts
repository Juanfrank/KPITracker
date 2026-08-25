import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch X — X2 (botón por fila del panel de detalle hacia Recolección de
 * ESE período, en vez del genérico "ir a la captura") y X3 (Histórico: clic
 * en el indicador abre el mismo panel de detalle que Estado, y la tabla
 * gana una columna Responsable).
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('detalle-seguimiento');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('preparación: usuario responsable, indicador mensual con un resultado capturado en un período cerrado', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-usuario').click();
  await pagina.getByTestId('usuario-nombreUsuario').fill('resp.detalle');
  await pagina.getByTestId('usuario-nombreCompleto').fill('Responsable Detalle');
  await pagina.getByTestId('usuario-password').fill('contrasenaSegura1');
  await pagina.getByTestId('guardar-usuario').click();
  await expect(pagina.getByTestId('usuario-resp.detalle')).toBeVisible();

  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador con detalle');
  await pagina.getByTestId('indicador-definicion').fill('Para probar el panel de detalle de Seguimiento.');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Mensual');
  await pagina.getByTestId('indicador-responsable').selectOption({ label: 'Responsable Detalle' });
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador con detalle')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador con detalle' });
  await pagina.getByTestId('recoleccion-periodo').selectOption({ index: 1 });
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2025-01-31');
  await pagina.getByTestId('celda-GENERAL').fill('42');
  await pagina.getByTestId('celda-GENERAL').press('Tab');
  await pagina.waitForTimeout(700);
});

test('Histórico: clic en el indicador abre el mismo panel de detalle que Estado, y la tabla muestra el Responsable', async () => {
  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await expect(pagina.getByTestId('tabla-historico')).toBeVisible();

  // Columna Responsable presente y con el nombre correcto.
  const filaHistorico = pagina.getByTestId('historico-Indicador con detalle');
  await expect(filaHistorico).toContainText('Responsable Detalle');

  // Clic en la fila abre el panel de detalle (antes no hacía nada: sin onClick).
  await filaHistorico.click();
  await expect(pagina.getByRole('heading', { name: 'Indicador con detalle' })).toBeVisible();
});

test('el panel de detalle tiene un botón por fila de período (no uno genérico) que navega a Recolección con ESE período', async () => {
  // Un botón "Ir a recolección" por cada fila de la tabla del panel — se toma el primero.
  const boton = pagina.locator('[data-testid^="detalle-ir-recoleccion-"]').first();
  const periodoId = (await boton.getAttribute('data-testid'))!.replace('detalle-ir-recoleccion-', '');
  await boton.click();

  await expect(pagina).toHaveURL(new RegExp(`/recoleccion\\?indicadorId=.*&periodoId=${periodoId}`));
  await expect(pagina.getByTestId('recoleccion-periodo')).toHaveValue(periodoId);
  await expect(pagina.getByTestId('recoleccion-indicador')).toHaveValue(/.+/);
});
