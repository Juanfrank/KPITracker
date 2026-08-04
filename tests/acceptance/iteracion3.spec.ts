import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Prueba de aceptación de la iteración 3: pestaña Histórico de Seguimiento
 * (períodos como columnas), atributos filtrables, y la plataforma de
 * orígenes automáticos (configuración de punta a punta; la ejecución real
 * de la consulta no está implementada todavía).
 */

let aplicacion: ElectronApplication;
let pagina: Page;
let dataDir: string;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-e2e-iter3-'));
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

test('crear un indicador, capturar un resultado y verlo en la pestaña Histórico de Seguimiento', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Cumplimiento de plazos');
  await pagina.getByTestId('indicador-definicion').fill('Porcentaje de casos resueltos dentro del plazo legal.');
  await pagina.getByTestId('indicador-meta').fill('90');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Cumplimiento de plazos')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Cumplimiento de plazos' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');
  await pagina.getByTestId('celda-GENERAL').fill('82.5');
  await pagina.getByTestId('celda-GENERAL').press('Enter');
  await pagina.waitForTimeout(1500);

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await expect(pagina.getByTestId('tabla-historico')).toBeVisible();
  const fila = pagina.getByTestId('historico-Cumplimiento de plazos');
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('82.5');
});

test('marcar un atributo como filtrable lo expone como filtro dinámico en Seguimiento', async () => {
  await pagina.getByTestId('nav-atributos').click();
  await pagina.getByTestId('nuevo-atributo').click();
  await pagina.getByTestId('atributo-nombre').fill('Prioridad');
  await pagina.getByLabel('Usar como filtro en Seguimiento').check();
  await pagina.getByTestId('guardar-atributo').click();

  await pagina.getByTestId('nav-seguimiento').click();
  await expect(pagina.getByTestId('filtro-atributo-Prioridad')).toBeVisible();
});

test('configurar un origen automático y asociarlo a un indicador habilita el botón de obtención automática en Recolección', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-origen').click();
  await pagina.getByTestId('origen-nombre').fill('API institucional');
  await pagina.getByTestId('origen-campo-url').fill('https://ejemplo.local/api/resultados');
  await pagina.getByTestId('guardar-origen').click();
  await expect(pagina.getByTestId('origen-API institucional')).toBeVisible();

  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('indicador-Cumplimiento de plazos').click();
  await pagina.getByTestId('indicador-origen-automatico').selectOption({ label: 'API institucional (API)' });
  await pagina.getByTestId('guardar-indicador').click();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Cumplimiento de plazos' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await expect(pagina.getByTestId('recoleccion-obtener-automatico')).toBeVisible();
  await pagina.getByTestId('recoleccion-obtener-automatico').click();
  await expect(pagina.getByTestId('aviso-obtener-automatico')).toContainText('no está implementada');
});
