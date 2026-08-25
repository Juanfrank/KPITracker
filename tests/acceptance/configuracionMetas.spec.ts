import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Nuevo tab "Configuración de Metas": similar a Recolección (elige un
 * indicador; filas = combinaciones de desagregación) pero pivotado por
 * período según la recurrencia elegida — todos los períodos del año a la
 * vista como columnas, para definir un valor objetivo distinto por
 * período. La columna "Recurrente" (Batch X, X11) edita el valor que
 * aplica por defecto a todos los períodos de esa periodicidad/año — antes
 * solo se podía definir desde la sección "Metas" del formulario de
 * Indicadores, retirada de ahí para que la gestión de metas viva
 * únicamente en este módulo. Un override puntual (celda con valor) tiene
 * prioridad sobre el recurrente; vaciar la celda borra el override y el
 * período vuelve a mostrar el recurrente como referencia (placeholder).
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('config-metas');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('preparación: indicador Mensual con una meta recurrente Trimestral (300) para el año en curso', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Cobertura de vacunación');
  await pagina.getByTestId('indicador-definicion').fill('Porcentaje de la población objetivo vacunada.');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Mensual');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Cobertura de vacunación')).toBeVisible();
});

test('la grilla muestra el indicador con sus períodos como columnas, según la periodicidad elegida', async () => {
  await pagina.getByTestId('nav-configuracion-metas').click();
  await expect(pagina.getByTestId('pagina-configuracion-metas')).toBeVisible();

  await pagina.getByTestId('configuracion-metas-indicador').selectOption({ label: 'Cobertura de vacunación' });
  // Por defecto toma la periodicidad de captura del indicador (Mensual).
  await expect(pagina.getByTestId('configuracion-metas-periodicidad')).toHaveValue('Mensual');
  await expect(pagina.getByTestId('tabla-configuracion-metas')).toBeVisible();

  // 12 columnas de período (Mensual) + 1 columna "Recurrente" + 1 columna de etiqueta de fila.
  const encabezados = pagina.getByTestId('tabla-configuracion-metas').locator('thead th');
  await expect(encabezados).toHaveCount(14);
  // 1 sola fila: "General" (el indicador no tiene desagregaciones).
  await expect(pagina.getByTestId('tabla-configuracion-metas').locator('tbody tr')).toHaveCount(1);
});

test('escribir un valor en una celda de período lo persiste como override puntual', async () => {
  const anio = new Date().getFullYear();
  const celdaMarzo = pagina.getByTestId(`meta-celda-GENERAL-${anio}-Mensual-03`);
  await celdaMarzo.fill('85');
  await celdaMarzo.blur();
  await expect(celdaMarzo).toHaveValue('85');

  // El guardado está debounced (~500ms, mismo patrón que la grilla de Metas de Indicadores) — espera a que
  // se materialice antes de recargar, o la relectura vería el estado todavía no persistido.
  await pagina.waitForTimeout(700);

  // Recarga el indicador (vuelve a pedir metas:listar) para confirmar que quedó persistido, no solo en memoria.
  await pagina.getByTestId('configuracion-metas-indicador').selectOption('');
  await pagina.getByTestId('configuracion-metas-indicador').selectOption({ label: 'Cobertura de vacunación' });
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Mensual-03`)).toHaveValue('85');
});

test('cambiar la periodicidad a Trimestral revela el valor recurrente (300) como referencia atenuada en cada trimestre', async () => {
  const anio = new Date().getFullYear();

  // Configura la meta recurrente Trimestral (300) desde la propia columna "Recurrente"
  // de Configuración de Metas (Batch X, X11) — ya no existe la sección "Metas" del
  // formulario de Indicadores.
  await pagina.getByTestId('nav-configuracion-metas').click();
  await pagina.getByTestId('configuracion-metas-indicador').selectOption({ label: 'Cobertura de vacunación' });
  await pagina.getByTestId('configuracion-metas-periodicidad').selectOption('Trimestral');
  const recurrente = pagina.getByTestId('meta-recurrente-GENERAL');
  await recurrente.fill('300');
  await recurrente.blur();
  await pagina.waitForTimeout(700);

  const celdaT1 = pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-01`);
  await expect(celdaT1).toHaveValue('');
  await expect(celdaT1).toHaveAttribute('placeholder', '300');
});

test('vaciar una celda con override borra el registro y vuelve a mostrar la recurrente', async () => {
  await pagina.getByTestId('configuracion-metas-periodicidad').selectOption('Mensual');
  const anio = new Date().getFullYear();
  const celdaMarzo = pagina.getByTestId(`meta-celda-GENERAL-${anio}-Mensual-03`);
  await expect(celdaMarzo).toHaveValue('85');
  await celdaMarzo.fill('');
  await celdaMarzo.blur();
  await expect(celdaMarzo).toHaveValue('');
  // Eliminar no está debounced, pero sigue siendo una llamada de red asíncrona — da margen antes de recargar.
  await pagina.waitForTimeout(300);

  await pagina.getByTestId('configuracion-metas-indicador').selectOption('');
  await pagina.getByTestId('configuracion-metas-indicador').selectOption({ label: 'Cobertura de vacunación' });
  await expect(pagina.getByTestId(`meta-celda-GENERAL-${anio}-Mensual-03`)).toHaveValue('');
});

test('la columna "Recurrente" persiste el valor recurrente y vaciarla lo elimina (deja de aparecer como placeholder)', async () => {
  await pagina.getByTestId('configuracion-metas-periodicidad').selectOption('Trimestral');
  const recurrente = pagina.getByTestId('meta-recurrente-GENERAL');
  await expect(recurrente).toHaveValue('300');

  // Recarga (reselecciona el indicador) para confirmar que quedó persistido, no solo en memoria.
  await pagina.getByTestId('configuracion-metas-indicador').selectOption('');
  await pagina.getByTestId('configuracion-metas-indicador').selectOption({ label: 'Cobertura de vacunación' });
  await pagina.getByTestId('configuracion-metas-periodicidad').selectOption('Trimestral');
  await expect(pagina.getByTestId('meta-recurrente-GENERAL')).toHaveValue('300');

  const anio = new Date().getFullYear();
  const celdaT1 = pagina.getByTestId(`meta-celda-GENERAL-${anio}-Trimestral-01`);
  await expect(celdaT1).toHaveAttribute('placeholder', '300');

  await pagina.getByTestId('meta-recurrente-GENERAL').fill('');
  await pagina.getByTestId('meta-recurrente-GENERAL').blur();
  await pagina.waitForTimeout(300);
  await expect(celdaT1).not.toHaveAttribute('placeholder', '300');
});
