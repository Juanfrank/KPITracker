import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch U11: Auditoría gana selección múltiple sobre filas de Resultado y
 * un botón "Restaurar seleccionados" que reutiliza
 * `recoleccion:restaurarVersion` (mismo mecanismo append-only de U10/B3),
 * en secuencia por cada fila marcada.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('auditoria-restaurar');
  pagina = app.pagina;
  cerrarApp = app.cerrar;

  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador auditoría rollback');
  await pagina.getByTestId('indicador-definicion').fill('Prueba de restaurar seleccionados desde Auditoría (Batch U11).');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador auditoría rollback')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador auditoría rollback' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');

  // Dos ediciones: la creación (null -> 10, sin versión previa) y un cambio (10 -> 20, sí la tiene).
  await pagina.getByTestId('celda-GENERAL').fill('10');
  await pagina.getByTestId('celda-GENERAL').blur();
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('10');
  await pagina.getByTestId('celda-GENERAL').fill('20');
  await pagina.getByTestId('celda-GENERAL').blur();
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('20');

  await pagina.getByTestId('nav-auditoria').click();
  await pagina.locator('.toolbar select').selectOption('Resultado');
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('seleccionar la fila del cambio 10→20 y restaurar la revierte a 10', async () => {
  const filas = pagina.locator('[data-testid="tabla-auditoria"] tbody tr');
  const filaCambio = filas.filter({ has: pagina.locator('td:last-child', { hasText: /^20$/ }) });
  await expect(filaCambio).toHaveCount(1);
  await filaCambio.locator('input[type="checkbox"]').check();

  await pagina.getByTestId('restaurar-seleccionados').click();
  await expect(pagina.getByTestId('aviso-restaurar-seleccionados')).toContainText('1 resultado(s) restaurado(s) a su valor anterior.');

  await pagina.getByTestId('nav-recoleccion').click();
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('10');
});

test('seleccionar la fila de creación (sin versión previa) informa que no se pudo restaurar', async () => {
  await pagina.getByTestId('nav-auditoria').click();
  await pagina.locator('.toolbar select').selectOption('Resultado');

  const filas = pagina.locator('[data-testid="tabla-auditoria"] tbody tr');
  // La fila de creación original: "Valor anterior" es "—" (null) y "Valor nuevo" es "10".
  const filaCreacion = filas.filter({
    has: pagina.locator('td:last-child', { hasText: /^10$/ })
  }).filter({
    has: pagina.locator('td', { hasText: '—' })
  });
  await expect(filaCreacion.first()).toBeVisible();
  await filaCreacion.first().locator('input[type="checkbox"]').check();

  await pagina.getByTestId('restaurar-seleccionados').click();
  await expect(pagina.getByTestId('aviso-restaurar-seleccionados')).toContainText('no se pudieron restaurar');
});
