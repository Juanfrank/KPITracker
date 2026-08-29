import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch AB (pedido explícito del usuario):
 * - Sidebar: "Cortes de medición" pasa a llamarse "Cortes".
 * - Un corte no se "calcula" bajo demanda (sin botón "Calcular" en la
 *   pantalla de configuración) — su valor agregado es dinámico, función de
 *   los resultados capturados, y se ve en contexto en Seguimiento >
 *   Histórico, en la celda colapsada del grupo de corte.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('batch-ab');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('AB1: el sidebar muestra "Cortes" (no "Cortes de medición")', async () => {
  await expect(pagina.getByTestId('nav-cortes-medicion')).toHaveText('Cortes');
});

test('AB2: sin botón "Calcular" en Cortes; el valor agregado se ve, dinámico, en Seguimiento > Histórico', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador Dinámico AB');
  await pagina.getByTestId('indicador-definicion').fill('Para probar el valor dinámico del corte.');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Mensual');
  // Meta global 100 — el corte agrega sobre el % de cumplimiento (valor/meta*100), no el valor
  // crudo, así que sin una meta resoluble el resultado capturado no produciría ningún %.
  await pagina.getByTestId('indicador-meta').fill('100');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador Dinámico AB')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador Dinámico AB' });
  const anio = new Date().getFullYear();
  await pagina.getByTestId('recoleccion-periodo').selectOption({ label: `Enero ${anio}` });
  await pagina.getByTestId('recoleccion-fecha-corte').fill(`${anio}-01-31`);
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.getByTestId('celda-GENERAL').fill('88');
  await pagina.getByTestId('celda-GENERAL').press('Enter');
  await pagina.waitForTimeout(1500);

  await pagina.getByTestId('nav-cortes-medicion').click();
  await expect(pagina.getByTestId('tabla-cortes-medicion')).toBeVisible();
  await expect(pagina.getByRole('button', { name: 'Calcular' })).toHaveCount(0);

  await pagina.getByTestId('nuevo-corte-medicion').click();
  await pagina.getByTestId('corte-nombre').fill('Corte Dinámico AB');
  await pagina.getByTestId('corte-periodicidad').selectOption('Trimestral');
  await pagina.getByTestId('corte-regla-general').selectOption('maximo');
  await pagina.getByTestId('guardar-corte-medicion').click();
  await expect(pagina.getByTestId('corte-medicion-Corte Dinámico AB')).toBeVisible();

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await expect(pagina.getByTestId('tabla-historico')).toBeVisible();
  await pagina.getByTestId('historico-filtro-cortes').selectOption({ label: 'Corte Dinámico AB (Trimestral)' });

  const grupoT1 = `grupo-corte-T1 ${anio}`;
  await expect(pagina.getByTestId(grupoT1)).toBeVisible();
  await pagina.getByTestId(`toggle-grupo-corte-T1 ${anio}`).click();

  // Colapsado: la celda del grupo muestra el % de cumplimiento REAL (88/meta 100 = 88%),
  // calculado en vivo — no un placeholder ni un botón "Calcular" de por medio.
  const filaHistorico = pagina.getByTestId('historico-Indicador Dinámico AB');
  await expect(filaHistorico.locator('td.columna-corte-colapsada')).toHaveText('88%');
});
