import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch U10: rollback de TODAS las desagregaciones del período (no todo el
 * histórico del indicador) a un punto en el tiempo, vía
 * `ServicioRecoleccion.restaurarPeriodo`. La UI expone un botón "Restaurar
 * período a…" con un selector datetime-local — el usuario reutiliza el
 * timestamp de "Última modificación" de cualquier celda del período.
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

/** "YYYY-MM-DDTHH:mm:ss" en hora LOCAL — mismo formato que espera un <input type="datetime-local" step={1}>. */
function comoDatetimeLocal(fecha: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}T${p(fecha.getHours())}:${p(fecha.getMinutes())}:${p(fecha.getSeconds())}`;
}

const esperar = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chromium/Playwright rechaza un segundo `.fill()` sobre el mismo
 * `<input type="datetime-local" step={1}>` con "Malformed value" (una
 * peculiaridad del propio input nativo, no un bug de la app) — se
 * setea el valor directo vía DOM y se dispara el evento `input` a mano.
 */
async function llenarDatetimeLocal(pagina: Page, testid: string, valor: string): Promise<void> {
  await pagina.getByTestId(testid).evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, valor);
}

test('restaurar el período a un momento anterior revierte TODAS las celdas cambiadas desde entonces', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador rollback período');
  await pagina.getByTestId('indicador-definicion').fill('Prueba de restaurarPeriodo (Batch U10).');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador rollback período')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador rollback período' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');

  await pagina.getByTestId('celda-GENERAL').fill('10');
  await pagina.getByTestId('celda-GENERAL').blur();
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('10');

  // Margen amplio (>1s) antes y después de capturar t1: el <input datetime-local>
  // solo tiene precisión de segundo, así que t1 debe caer holgadamente DESPUÉS
  // del timestamp real de la escritura de "10" y ANTES del de "20" — nunca en
  // el mismo segundo que cualquiera de las dos, o la comparación por igualdad
  // de segundo podría incluir/excluir la escritura equivocada.
  await esperar(1200);
  const t1 = new Date();
  await esperar(1200);

  // Segundo estado: 20 — el que "Restaurar período a t1" debe revertir.
  await pagina.getByTestId('celda-GENERAL').fill('20');
  await pagina.getByTestId('celda-GENERAL').blur();
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('20');

  await pagina.getByTestId('abrir-restaurar-periodo').click();
  await llenarDatetimeLocal(pagina, 'restaurar-periodo-timestamp', comoDatetimeLocal(t1));
  await pagina.getByTestId('confirmar-restaurar-periodo').click();

  await expect(pagina.getByTestId('aviso-restaurar-periodo')).toContainText('restaurada');
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('10');
});

test('restaurar a un momento anterior a cualquier valor no cambia nada y lo informa', async () => {
  // Sigue con el mismo indicador/período de la prueba anterior (grilla ya en 10).
  await pagina.getByTestId('abrir-restaurar-periodo').click();
  await llenarDatetimeLocal(pagina, 'restaurar-periodo-timestamp', '1970-01-01T00:00:00');
  await pagina.getByTestId('confirmar-restaurar-periodo').click();

  await expect(pagina.getByTestId('aviso-restaurar-periodo')).toContainText('Ninguna celda cambió');
  await expect(pagina.getByTestId('celda-GENERAL')).toHaveValue('10');
});
