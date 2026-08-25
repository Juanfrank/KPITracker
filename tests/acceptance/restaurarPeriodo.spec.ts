import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch U10 (rollback de TODAS las desagregaciones del período) + Batch X
 * X5 (reubicación + rediseño de la UI): "Restaurar período" vive ahora en
 * la misma fila que Indicador/Período/Fecha de corte, y su interfaz es un
 * ícono + panel flotante con puntos reales para elegir (mismo patrón que
 * `HistorialCelda`, "restaurar versión anterior por punto de datos") en vez
 * del `datetime-local` de antes.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('restaurar-periodo');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

const esperar = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

test('restaurar el período a un momento anterior revierte TODAS las celdas cambiadas desde entonces', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador rollback período');
  await pagina.getByTestId('indicador-definicion').fill('Prueba de restaurarPeriodo (Batch U10 / X5).');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador rollback período')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador rollback período' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');

  // El botón vive en la misma fila que Indicador/Período/Fecha de corte (X5).
  await expect(pagina.getByTestId('recoleccion-fecha-corte').locator('xpath=ancestor::div[contains(@class,"fila-form")]'))
    .toContainText('Restaurar período');

  await pagina.getByTestId('celda-GENERAL').fill('10');
  await pagina.getByTestId('celda-GENERAL').blur();
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('10');
  await esperar(300); // margen para que "10" quede registrado como versión anterior antes de escribir "20".

  await pagina.getByTestId('celda-GENERAL').fill('20');
  await pagina.getByTestId('celda-GENERAL').blur();
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('20');

  // Abre el panel: en vez de escribir una fecha/hora a mano, se elige un punto real
  // de la lista — el mismo "10" que quedó archivado en el historial de la celda al
  // sobrescribirse con "20".
  await pagina.getByTestId('abrir-restaurar-periodo').click();
  await expect(pagina.getByTestId('panel-restaurar-periodo')).toBeVisible();
  const puntos = pagina.locator('[data-testid^="restaurar-periodo-"]');
  await expect(puntos).toHaveCount(1); // una sola versión archivada (el "10" reemplazado por "20").
  await puntos.first().click();

  await expect(pagina.getByTestId('aviso-restaurar-periodo')).toContainText('restaurada');
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('10');
});

test('sin ninguna versión anterior archivada, el panel lo informa y no hay nada para restaurar', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador sin historial');
  await pagina.getByTestId('indicador-definicion').fill('Nunca se sobrescribió ninguna celda.');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador sin historial')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador sin historial' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');
  await pagina.getByTestId('celda-GENERAL').fill('5');
  await pagina.getByTestId('celda-GENERAL').blur();
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('5');

  await pagina.getByTestId('abrir-restaurar-periodo').click();
  await expect(pagina.getByTestId('panel-restaurar-periodo')).toContainText('Sin puntos anteriores');
  await expect(pagina.locator('[data-testid^="restaurar-periodo-"]')).toHaveCount(0);
});
