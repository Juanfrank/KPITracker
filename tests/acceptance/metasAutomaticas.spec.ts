import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch X — X14: panel "Establecer metas automáticamente" en Configuración
 * de Metas — Valor inicial, Período inicial, Modo (mismo valor / subir o
 * bajar N o N% entre períodos) y un botón "Aplicar" que escribe el valor
 * objetivo del período elegido y todos los siguientes.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('metas-automaticas');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('preparación: indicador Trimestral', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador metas automáticas');
  await pagina.getByTestId('indicador-definicion').fill('Prueba del panel de metas automáticas (Batch X, X14).');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Trimestral');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador metas automáticas')).toBeVisible();
});

test('"Mismo valor en todos los períodos" escribe el mismo valor desde el período inicial en adelante', async () => {
  const anio = new Date().getFullYear();
  await pagina.getByTestId('nav-configuracion-metas').click();
  await pagina.getByTestId('configuracion-metas-indicador').selectOption({ label: 'Indicador metas automáticas' });
  await expect(pagina.getByTestId('panel-metas-automaticas')).toBeVisible();

  await pagina.getByTestId('metas-auto-valor').fill('50');
  await pagina.getByTestId('metas-auto-periodo-inicial').selectOption(`${anio}-Trimestral-02`);
  await pagina.getByTestId('metas-auto-modo').selectOption('constante');
  await pagina.getByTestId('aplicar-metas-auto').click();

  await expect(pagina.getByTestId('aviso-metas-auto')).toContainText('3 período(s)');
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-01`)).toHaveValue('');
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-02`)).toHaveValue('50');
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-03`)).toHaveValue('50');
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-04`)).toHaveValue('50');
});

test('"Subir N entre períodos" incrementa el valor de forma acumulativa a partir del inicial', async () => {
  const anio = new Date().getFullYear();
  await pagina.getByTestId('metas-auto-valor').fill('100');
  await pagina.getByTestId('metas-auto-periodo-inicial').selectOption(`${anio}-Trimestral-01`);
  await pagina.getByTestId('metas-auto-modo').selectOption('incrementoAbsoluto');
  await expect(pagina.getByTestId('metas-auto-incremento')).toBeVisible();
  await pagina.getByTestId('metas-auto-incremento').fill('10');
  await pagina.getByTestId('aplicar-metas-auto').click();

  await expect(pagina.getByTestId('aviso-metas-auto')).toContainText('4 período(s)');
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-01`)).toHaveValue('100');
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-02`)).toHaveValue('110');
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-03`)).toHaveValue('120');
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-04`)).toHaveValue('130');
});

test('"Subir N% entre períodos" incrementa geométricamente el valor', async () => {
  const anio = new Date().getFullYear();
  await pagina.getByTestId('metas-auto-valor').fill('100');
  await pagina.getByTestId('metas-auto-periodo-inicial').selectOption(`${anio}-Trimestral-01`);
  await pagina.getByTestId('metas-auto-modo').selectOption('incrementoPorcentual');
  await pagina.getByTestId('metas-auto-incremento').fill('10');
  await pagina.getByTestId('aplicar-metas-auto').click();

  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-01`)).toHaveValue('100');
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-02`)).toHaveValue('110');
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-03`)).toHaveValue('121');
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-04`)).toHaveValue('133.1');
});

test('un valor inicial vacío informa el error y no aplica nada', async () => {
  const anio = new Date().getFullYear();
  await pagina.getByTestId('metas-auto-valor').fill('');
  await pagina.getByTestId('aplicar-metas-auto').click();
  await expect(pagina.getByTestId('aviso-metas-auto')).toContainText('valor inicial válido');
  // Los valores del test anterior no cambiaron.
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-04`)).toHaveValue('133.1');
});
