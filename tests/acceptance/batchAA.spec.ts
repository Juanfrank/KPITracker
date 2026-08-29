import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch AA (pedido explícito del usuario):
 * - "Cortes de medición" se muda a un módulo propio del sidebar, debajo de "Metas".
 * - Lo implementado como "colapsar y expandir" en Batch Z corresponde en realidad al
 *   panel de Seguimiento > Histórico (un corte agrega RESULTADOS capturados, que
 *   Histórico muestra — Metas define OBJETIVOS, nunca tuvo sentido agrupar ahí).
 * - Cortes de medición gana dos toggles, encendidos por defecto: "Omitir períodos sin
 *   meta" y "Acotar resultado al 100%".
 * - Un corte ya no se define por una fecha puntual — es una periodicidad recurrente
 *   superior al mes (Bimestral..Anual).
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('batch-aa');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('AA1: "Cortes de medición" es un módulo propio del sidebar, inmediatamente debajo de "Metas"', async () => {
  await pagina.getByTestId('nav-configuracion-metas').waitFor();
  const ids = await pagina.locator('nav.sidebar a[data-testid^="nav-"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  const indiceMetas = ids.indexOf('nav-configuracion-metas');
  const indiceCortes = ids.indexOf('nav-cortes-medicion');
  expect(indiceMetas).toBeGreaterThanOrEqual(0);
  expect(indiceCortes).toBe(indiceMetas + 1);
});

test('AA2: Cortes de medición — periodicidad (no fecha) + los dos toggles nuevos, encendidos por defecto', async () => {
  await pagina.getByTestId('nav-cortes-medicion').click();
  await expect(pagina.getByTestId('tabla-cortes-medicion')).toBeVisible();

  await pagina.getByTestId('nuevo-corte-medicion').click();
  await expect(pagina.getByTestId('corte-periodicidad')).toBeVisible();
  // "Superior al mes": Mensual no debe ofrecerse como opción de periodicidad del corte.
  const opcionesPeriodicidad = await pagina.getByTestId('corte-periodicidad').locator('option').allTextContents();
  expect(opcionesPeriodicidad).not.toContain('Mensual');
  expect(opcionesPeriodicidad).toEqual(expect.arrayContaining(['Bimestral', 'Trimestral', 'Cuatrimestral', 'Semestral', 'Anual']));

  await expect(pagina.getByTestId('corte-omitir-sin-meta')).toBeChecked();
  await expect(pagina.getByTestId('corte-acotar-100')).toBeChecked();

  await pagina.getByTestId('corte-nombre').fill('Corte Trimestral AA');
  await pagina.getByTestId('corte-periodicidad').selectOption('Trimestral');
  await pagina.getByTestId('guardar-corte-medicion').click();
  await expect(pagina.getByTestId('corte-medicion-Corte Trimestral AA')).toBeVisible();
  await expect(pagina.getByTestId('corte-medicion-Corte Trimestral AA')).toContainText('Trimestral');
});

test('AA3: columnas de corte agrupadas en Seguimiento > Histórico — filtro multi-select, expandir/colapsar', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador Histórico AA');
  await pagina.getByTestId('indicador-definicion').fill('Para probar columnas de corte agrupadas en Histórico.');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Mensual');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador Histórico AA')).toBeVisible();

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await expect(pagina.getByTestId('tabla-historico')).toBeVisible();

  // Enero del año en curso: solo aparece como columna si ya cerró (Histórico solo muestra
  // períodos cerrados) — el corte Trimestral de AA2 agrupa Enero-Marzo bajo "T1 <año>".
  const anio = new Date().getFullYear();
  const celdaEnero = `historico-Indicador Histórico AA-${anio}-Mensual-01`;
  await expect(pagina.getByTestId(celdaEnero)).toBeVisible();

  // Batch AK: el multi-select nativo pasó a ser un dropdown compacto (botón + panel de checkboxes).
  await pagina.getByTestId('historico-filtro-cortes').click();
  await pagina.getByTestId('historico-filtro-cortes-opcion-Corte Trimestral AA (Trimestral)').click();
  await pagina.getByTestId('historico-filtro-cortes').click(); // cierra el panel
  const grupoT1 = `grupo-corte-T1 ${anio}`;
  await expect(pagina.getByTestId(grupoT1)).toBeVisible();
  // Expandido por defecto: enero sigue siendo su propia columna, bajo el grupo.
  await expect(pagina.getByTestId(celdaEnero)).toBeVisible();

  await pagina.getByTestId(`toggle-grupo-corte-T1 ${anio}`).click();
  // Colapsado: la celda individual de enero desaparece, queda solo la columna del grupo.
  await expect(pagina.getByTestId(celdaEnero)).toHaveCount(0);
  await expect(pagina.getByTestId(grupoT1)).toBeVisible();

  await pagina.getByTestId(`toggle-grupo-corte-T1 ${anio}`).click();
  await expect(pagina.getByTestId(celdaEnero)).toBeVisible();
});
