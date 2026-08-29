import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch Z (pedido explícito del usuario):
 * - Rol "Visitante" (sin permisos) como nuevo default de usuarios nuevos.
 * - 6 reglas de agregación nuevas, exclusivas de Cortes de medición.
 *
 * (La grupación de columnas por corte, originalmente en el panel de Metas,
 * se rediseñó y reubicó a Seguimiento > Histórico en Batch AA — ver
 * `batchAA.spec.ts`. "Cortes de medición" pasó a su propio módulo del
 * sidebar, también en Batch AA — de ahí el `nav-cortes-medicion` abajo.)
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('batch-z');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('Z1: "Visitante" (sin permisos) es el rol general que trae un usuario nuevo por defecto', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-usuario').click();
  await pagina.getByTestId('usuario-nombreUsuario').fill('nuevo.visitante');
  await pagina.getByTestId('usuario-nombreCompleto').fill('Nuevo Visitante');
  await pagina.getByTestId('usuario-password').fill('contrasenaSegura1');
  await pagina.getByTestId('guardar-usuario').click();
  await expect(pagina.getByTestId('usuario-nuevo.visitante')).toBeVisible();

  await pagina.getByTestId('usuario-nuevo.visitante').click();
  await expect(pagina.getByTestId('usuario-rol-general')).toHaveValue(/.+/);
  const etiqueta = await pagina.getByTestId('usuario-rol-general').locator('option:checked').textContent();
  expect(etiqueta).toBe('Visitante');
  await pagina.getByRole('button', { name: 'Cancelar' }).click();
});

test('Z2: Cortes de medición ofrece las 6 reglas nuevas (mejor/peor/sumatoria/mediana/primer/último valor)', async () => {
  await pagina.getByTestId('nav-cortes-medicion').click();
  await pagina.getByTestId('nuevo-corte-medicion').click();
  const opciones = await pagina.getByTestId('corte-regla-general').locator('option').allTextContents();
  for (const etiqueta of ['Mejor valor', 'Peor valor', 'Sumatoria', 'Mediana', 'Primer valor', 'Último valor']) {
    expect(opciones).toContain(etiqueta);
  }
  await pagina.getByRole('button', { name: 'Cancelar' }).click();
});
