import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Prueba de aceptación de punta a punta sobre la aplicación Electron real:
 * crear lista -> crear indicador con desagregación -> capturar resultados
 * (autoguardado) -> fecha de corte -> verificar seguimiento -> verificar
 * que la capa analítica Parquet se materializó en disco.
 */

let aplicacion: ElectronApplication;
let pagina: Page;
let dataDir: string;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-e2e-'));
  aplicacion = await electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...process.env,
      KPITRACKER_DATA_DIR: dataDir,
      ELECTRON_DISABLE_SANDBOX: '1'
    }
  });
  pagina = await aplicacion.firstWindow();
  await pagina.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await aplicacion.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test.describe.configure({ mode: 'serial' });

test('la aplicación abre en el tablero de seguimiento', async () => {
  await expect(pagina.getByTestId('pagina-seguimiento')).toBeVisible();
  await expect(pagina.getByTestId('tabla-seguimiento')).toBeVisible();
});

test('crear una lista de selección con elementos', async () => {
  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('nueva-lista').click();
  await pagina.getByTestId('lista-nombre').fill('Sexo');
  await pagina.getByTestId('guardar-lista').click();

  await expect(pagina.getByTestId('lista-Sexo')).toBeVisible();
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-codigo-1').fill('M');
  await pagina.getByTestId('elemento-desc-1').fill('Masculino');
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-codigo-2').fill('F');
  await pagina.getByTestId('elemento-desc-2').fill('Femenino');
});

test('crear un indicador trimestral con desagregación por sexo', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Tasa de resolución de casos');
  await pagina.getByTestId('indicador-definicion').fill('Porcentaje de casos resueltos sobre casos ingresados.');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Trimestral');
  await pagina.getByTestId('indicador-linea-base').fill('60');
  await pagina.getByTestId('indicador-meta').fill('90');
  await pagina.getByTestId('desagregacion-Sexo').check();
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Tasa de resolución de casos')).toBeVisible();
});

test('capturar resultados con autoguardado y fecha de corte', async () => {
  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Tasa de resolución de casos' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();

  // Fila General + M + F = 3 filas de captura.
  const filas = pagina.getByTestId('grilla-captura').locator('tbody tr');
  await expect(filas).toHaveCount(3);

  await pagina.getByTestId('celda-GENERAL').fill('82.5');
  await pagina.getByTestId('celda-GENERAL').press('Enter');
  // La navegación con Enter mueve el foco a la siguiente fila (edición rápida).
  await pagina.keyboard.type('80');
  await pagina.keyboard.press('Enter');
  await pagina.keyboard.type('85');
  await pagina.keyboard.press('Enter');

  const periodoId = await pagina.getByTestId('recoleccion-periodo').inputValue();
  expect(periodoId).toContain('Trimestral');

  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');
  // Espera a que el autoguardado y la exportación diferida se materialicen.
  await pagina.waitForTimeout(2500);
});

test('el seguimiento refleja el avance del indicador', async () => {
  await pagina.getByTestId('nav-seguimiento').click();
  const fila = pagina.getByTestId('seguimiento-Tasa de resolución de casos');
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('Trimestral');
});

test('la capa analítica Parquet quedó sincronizada en disco', async () => {
  expect(existsSync(join(dataDir, 'Export', 'ResultadosAnalitico.parquet'))).toBe(true);
  expect(existsSync(join(dataDir, 'Config', 'Indicadores.parquet'))).toBe(true);
  expect(existsSync(join(dataDir, 'Dimensions', 'DimPeriodo.parquet'))).toBe(true);
});

test('el tema oscuro se puede alternar', async () => {
  await pagina.locator('.sidebar .pie .boton').first().click();
  await expect(pagina.locator('html')).toHaveAttribute('data-tema', 'oscuro');
  await pagina.locator('.sidebar .pie .boton').first().click();
  await expect(pagina.locator('html')).toHaveAttribute('data-tema', 'claro');
});
