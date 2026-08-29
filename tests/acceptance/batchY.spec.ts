import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch Y (pedido explícito del usuario): orden de los roles de equipo,
 * nuevo rol general "Administrador", y las dos pantallas nuevas de
 * medición (Cortes de medición en Configuración de Metas; medición por
 * categoría en Administración → Categorías).
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('batch-y');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('Y1: los roles de equipo se listan en el orden Líder, Validador, Colaborador, Visor (no alfabético)', async () => {
  await pagina.getByTestId('nav-admin').click();
  // Cada fila de rol lleva `data-testid="rol-<nombre>"` — leer el atributo (no el texto visible,
  // que agrega "(sistema)") preserva el orden real del DOM sin ambigüedad de coincidencias parciales.
  const filas = pagina.locator('tbody tr[data-testid^="rol-"]');
  const testids = await filas.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  const nombresEnOrden = testids.map((id) => id!.replace('rol-', ''));
  const equipoEnOrden = nombresEnOrden.filter((n) => ['Líder de equipo', 'Validador', 'Colaborador', 'Visor'].includes(n));
  expect(equipoEnOrden).toEqual(['Líder de equipo', 'Validador', 'Colaborador', 'Visor']);
});

test('Y3: existe el rol general "Administrador" y no se puede eliminar (rol del sistema)', async () => {
  await pagina.getByTestId('rol-Administrador').click();
  await expect(pagina.getByTestId('rol-nombre')).toBeDisabled();
  await expect(pagina.getByRole('button', { name: 'Eliminar' })).toHaveCount(0);
  await pagina.getByRole('button', { name: 'Cancelar' }).click();
});

test('Y6: Cortes de medición — crear uno y calcularlo', async () => {
  await pagina.getByTestId('nav-configuracion-metas').click();
  await expect(pagina.getByTestId('panel-cortes-medicion')).toBeVisible();

  await pagina.getByTestId('nuevo-corte-medicion').click();
  await pagina.getByTestId('corte-nombre').fill('Corte de prueba');
  await pagina.getByTestId('corte-fecha').fill('2026-06-30');
  await pagina.getByTestId('corte-regla-general').selectOption('maximo');
  await pagina.getByTestId('guardar-corte-medicion').click();
  await expect(pagina.getByTestId('corte-medicion-Corte de prueba')).toBeVisible();

  await pagina.getByTestId('calcular-corte-Corte de prueba').click();
  await expect(pagina.getByText('Resultado — Corte de prueba')).toBeVisible();
});

test('Y7: medición por categoría — configurar la regla general de una categoría', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nueva-categoria').click();
  await pagina.getByTestId('categoria-nombre').fill('Categoría con medición');
  await pagina.getByTestId('guardar-categoria').click();
  await expect(pagina.getByTestId('categoria-Categoría con medición')).toBeVisible();

  await pagina.getByTestId('categoria-Categoría con medición').click();
  await expect(pagina.getByTestId('categoria-medicion-regla-general')).toBeVisible();
  await pagina.getByTestId('categoria-medicion-regla-general').selectOption('maximo');
  await pagina.getByTestId('guardar-categoria').click();

  // Reabrir y confirmar que la regla persistió.
  await pagina.getByTestId('categoria-Categoría con medición').click();
  await expect(pagina.getByTestId('categoria-medicion-regla-general')).toHaveValue('maximo');
});
