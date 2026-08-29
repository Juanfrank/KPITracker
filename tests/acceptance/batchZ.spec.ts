import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch Z (pedido explícito del usuario):
 * - Rol "Visitante" (sin permisos) como nuevo default de usuarios nuevos.
 * - 6 reglas de agregación nuevas, exclusivas de Cortes de medición.
 * - Columnas de corte agrupadas/colapsables en el panel de Metas + filtro multi-select.
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
  await pagina.getByTestId('nav-configuracion-metas').click();
  await pagina.getByTestId('nuevo-corte-medicion').click();
  const opciones = await pagina.getByTestId('corte-regla-general').locator('option').allTextContents();
  for (const etiqueta of ['Mejor valor', 'Peor valor', 'Sumatoria', 'Mediana', 'Primer valor', 'Último valor']) {
    expect(opciones).toContain(etiqueta);
  }
  await pagina.getByRole('button', { name: 'Cancelar' }).click();
});

test('Z3: columnas de corte agrupadas — filtro multi-select, estilo de grupo, expandir/colapsar', async () => {
  // Indicador Mensual para tener períodos que un corte de mitad de año pueda agrupar.
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador Corte Z3');
  await pagina.getByTestId('indicador-definicion').fill('Para probar columnas de corte agrupadas.');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Mensual');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador Corte Z3')).toBeVisible();

  await pagina.getByTestId('nav-configuracion-metas').click();
  await pagina.getByTestId('nuevo-corte-medicion').click();
  await pagina.getByTestId('corte-nombre').fill('Corte Z3');
  await pagina.getByTestId('corte-fecha').fill(`${new Date().getFullYear()}-06-30`);
  await pagina.getByTestId('guardar-corte-medicion').click();
  await expect(pagina.getByTestId('corte-medicion-Corte Z3')).toBeVisible();

  await pagina.getByTestId('configuracion-metas-indicador').selectOption({ label: 'Indicador Corte Z3' });
  await expect(pagina.getByTestId('tabla-configuracion-metas')).toBeVisible();

  // Antes de activar el filtro: sin agrupación, la celda de enero se ve directo.
  const anio = new Date().getFullYear();
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Mensual-01`)).toBeVisible();

  await pagina.getByTestId('metas-filtro-cortes').selectOption({ label: `Corte Z3 (${anio}-06-30)` });
  await expect(pagina.getByTestId('grupo-corte-Corte Z3')).toBeVisible();
  // Expandido por defecto: enero sigue siendo su propia columna, bajo el grupo.
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Mensual-01`)).toBeVisible();

  await pagina.getByTestId('toggle-grupo-corte-Corte Z3').click();
  // Colapsado: la celda individual de enero desaparece, queda solo la columna del grupo.
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Mensual-01`)).toHaveCount(0);
  await expect(pagina.getByTestId('grupo-corte-Corte Z3')).toBeVisible();

  await pagina.getByTestId('toggle-grupo-corte-Corte Z3').click();
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Mensual-01`)).toBeVisible();
});
