import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Prueba de aceptación de la iteración 2: periodicidad personalizada de
 * punta a punta, constructor visual de reglas, y filtros de responsable
 * en Seguimiento.
 */

let aplicacion: ElectronApplication;
let pagina: Page;
let dataDir: string;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-e2e-iter2-'));
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

test('crear una definición de periodicidad personalizada con dos semestres', async () => {
  await pagina.getByTestId('nav-config-general').click();
  await pagina.getByTestId('nueva-periodicidad').click();
  await pagina.getByTestId('periodicidad-nombre').fill('Semestres personalizados');
  await pagina.getByTestId('corte-etiqueta-1').fill('Primer semestre');
  // Ajustar el primer corte a enero-junio.
  const filaCorte1 = pagina.getByTestId('corte-etiqueta-1').locator('xpath=ancestor::div[contains(@class,"fila-form")]');
  // El primer select del corte es "Mes inicio" (ya en enero por defecto); el segundo es "Mes fin".
  await filaCorte1.locator('select').nth(1).selectOption('6');

  await pagina.getByTestId('agregar-corte').click();
  await pagina.getByTestId('corte-etiqueta-2').fill('Segundo semestre');

  await pagina.getByTestId('guardar-periodicidad').click();
  await expect(pagina.getByTestId('periodicidad-Semestres personalizados')).toBeVisible();
});

test('crear un responsable', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-responsable').click();
  await pagina.getByTestId('responsable-nombre').fill('Ana Martínez');
  await pagina.getByTestId('guardar-responsable').click();
  await expect(pagina.getByTestId('responsable-Ana Martínez')).toBeVisible();
});

test('crear un indicador con periodicidad personalizada y responsable asignado', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Ejecución presupuestaria');
  await pagina.getByTestId('indicador-definicion').fill('Porcentaje de presupuesto ejecutado en el semestre.');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Personalizada');
  await pagina.getByTestId('indicador-periodicidad-personalizada').selectOption({ label: 'Semestres personalizados' });
  await pagina.getByTestId('indicador-responsable').selectOption({ label: 'Ana Martínez' });
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Ejecución presupuestaria')).toBeVisible();
});

test('capturar un resultado en el período "Primer semestre" generado por la definición personalizada', async () => {
  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Ejecución presupuestaria' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();

  const selectorPeriodo = pagina.getByTestId('recoleccion-periodo');
  const valorPrimerSemestre = await selectorPeriodo.locator('option', { hasText: 'Primer semestre' }).first().getAttribute('value');
  expect(valorPrimerSemestre).toBeTruthy();
  await selectorPeriodo.selectOption(valorPrimerSemestre!);

  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-03-31');
  await pagina.getByTestId('celda-GENERAL').fill('55');
  await pagina.getByTestId('celda-GENERAL').blur();
  await pagina.waitForTimeout(500);
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('55');
});

test('el filtro por responsable en Seguimiento muestra solo sus indicadores', async () => {
  await pagina.getByTestId('nav-seguimiento').click();
  await expect(pagina.getByTestId('seguimiento-Ejecución presupuestaria')).toBeVisible();

  await pagina.getByTestId('filtro-responsable').selectOption({ label: 'Ana Martínez' });
  await expect(pagina.getByTestId('seguimiento-Ejecución presupuestaria')).toBeVisible();

  await pagina.getByTestId('filtro-responsable').selectOption('todos');
});

test('crear una regla de validación cruzada con el constructor visual', async () => {
  await pagina.getByTestId('nav-reglas').click();
  await pagina.getByTestId('nueva-regla').click();
  await pagina.getByTestId('regla-nombre').fill('Línea base bajo la meta');
  await pagina.getByTestId('regla-tipo').selectOption('ValidacionCruzada');

  await pagina.getByTestId('condicion-atributo').fill('LineaBase');
  await pagina.getByTestId('condicion-operador').selectOption('lt');
  await pagina.getByTestId('condicion-valor-es-atributo').check();
  await pagina.getByTestId('condicion-valor').fill('MetaGlobal');

  await pagina.getByTestId('guardar-regla').click();
  await expect(pagina.getByTestId('regla-Línea base bajo la meta')).toBeVisible();
  await expect(pagina.getByTestId('regla-Línea base bajo la meta')).toContainText('LineaBase es menor que MetaGlobal');
});
