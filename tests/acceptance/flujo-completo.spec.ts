import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { iniciarAppWeb } from './fixtures';

/**
 * Prueba de aceptación de punta a punta sobre el servidor web real:
 * crear lista -> crear indicador con desagregación -> capturar resultados
 * (autoguardado) -> fecha de corte -> verificar seguimiento.
 */

let pagina: Page;
let dataDir: string;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('flujo');
  pagina = app.pagina;
  dataDir = app.dataDir;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
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
  await pagina.getByTestId('lista-prefijo').fill('SEXO');
  await pagina.getByTestId('guardar-lista').click();

  await expect(pagina.getByTestId('lista-Sexo')).toBeVisible();
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-codigo-1').fill('M');
  await pagina.getByTestId('elemento-nombre-1').fill('Masculino');
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-codigo-2').fill('F');
  await pagina.getByTestId('elemento-nombre-2').fill('Femenino');
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

  const periodoId = await pagina.getByTestId('recoleccion-periodo').inputValue();
  expect(periodoId).toContain('Trimestral');

  // La fecha de corte debe establecerse antes de que la captura se habilite.
  await expect(pagina.getByTestId('celda-GENERAL')).toBeDisabled();
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');
  await expect(pagina.getByTestId('celda-GENERAL')).toBeEnabled();

  await pagina.getByTestId('celda-GENERAL').fill('82.5');
  await pagina.getByTestId('celda-GENERAL').press('Enter');
  // La navegación con Enter mueve el foco a la siguiente fila (edición rápida).
  await pagina.keyboard.type('80');
  await pagina.keyboard.press('Enter');
  await pagina.keyboard.type('85');
  await pagina.keyboard.press('Enter');

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
  // La regeneración de la exportación analítica es diferida (debounce) tras
  // cada escritura — la última captura de esta suite ya esperó su propio
  // `waitForTimeout` más arriba, así que a esta altura ya debería haberse
  // materializado.
  expect(existsSync(join(dataDir, 'Export', 'ResultadosAnalitico.parquet'))).toBe(true);
  expect(existsSync(join(dataDir, 'Dimensions', 'DimPeriodo.parquet'))).toBe(true);
  expect(existsSync(join(dataDir, 'Dimensions', 'DimIndicador.parquet'))).toBe(true);
});

test('el tema claro/oscuro se puede alternar', async () => {
  // El tema persiste en localStorage entre ejecuciones: se parte del estado actual.
  const inicial = await pagina.locator('html').getAttribute('data-tema');
  const contrario = inicial === 'claro' ? 'oscuro' : 'claro';
  await pagina.locator('.sidebar .pie .boton').first().click();
  await expect(pagina.locator('html')).toHaveAttribute('data-tema', contrario);
  await pagina.locator('.sidebar .pie .boton').first().click();
  await expect(pagina.locator('html')).toHaveAttribute('data-tema', inicial ?? 'claro');
});

test('Batch AR: el menú lateral se puede colapsar/expandir — oculta el texto, conserva los íconos', async () => {
  const etiquetaSeguimiento = pagina.getByTestId('nav-seguimiento').locator('.etiqueta-nav');
  await expect(etiquetaSeguimiento).toBeVisible();

  await pagina.getByTestId('alternar-sidebar').click();
  await expect(pagina.locator('.sidebar')).toHaveClass(/colapsado/);
  await expect(etiquetaSeguimiento).toBeHidden();
  // El ícono y el link siguen siendo clickeables — la navegación no se pierde al colapsar.
  await expect(pagina.getByTestId('nav-seguimiento')).toBeVisible();

  await pagina.getByTestId('alternar-sidebar').click();
  await expect(pagina.locator('.sidebar')).not.toHaveClass(/colapsado/);
  await expect(etiquetaSeguimiento).toBeVisible();
});
