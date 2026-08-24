import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Grid Excel-like de Metas (no globales) en IndicadoresPage: la grilla
 * reemplaza las tarjetas por fila anteriores y el selector de
 * "Desagregación" pasa de un input de texto con sintaxis interna opaca
 * (`<listaId>=<codigo>`) a un `<select>` con etiquetas legibles. Además
 * soporta pegado estilo Excel: una línea de portapapeles con columnas
 * [Valor, Año, Periodicidad, Desagregación, Método] separadas por
 * tabulador actualiza la fila pegada y crea filas nuevas para las líneas
 * que excedan las existentes.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('metas-grid');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

/** Simula un pegado de portapapeles (sin depender de permisos del navegador) disparando un evento `paste` nativo con `clipboardData`. */
async function pegarEnCelda(pagina: Page, testId: string, texto: string): Promise<void> {
  await pagina.evaluate(
    ({ testId, texto }) => {
      const el = document.querySelector(`[data-testid="${testId}"]`);
      if (!el) throw new Error(`No se encontró el elemento ${testId}`);
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text', texto);
      el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dataTransfer }));
    },
    { testId, texto }
  );
}

/** Texto de la opción actualmente seleccionada en un `<select>`. */
async function opcionSeleccionada(pagina: Page, testId: string): Promise<string> {
  return pagina.getByTestId(testId).evaluate((el) => {
    const select = el as HTMLSelectElement;
    return select.options[select.selectedIndex]?.textContent ?? '';
  });
}

test('preparación: lista "Zona" con dos elementos e indicador con esa desagregación', async () => {
  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('nueva-lista').click();
  await pagina.getByTestId('lista-nombre').fill('Zona');
  await pagina.getByTestId('lista-prefijo').fill('ZON');
  await pagina.getByTestId('guardar-lista').click();
  await expect(pagina.getByTestId('lista-Zona')).toBeVisible();
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-codigo-1').fill('N');
  await pagina.getByTestId('elemento-nombre-1').fill('Norte');
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-codigo-2').fill('S');
  await pagina.getByTestId('elemento-nombre-2').fill('Sur');

  // El guardado de nombre/código está debounced (Batch U8, ~500ms) — espera
  // a que se materialice antes de navegar, o el indicador leerá los
  // nombres por defecto ("Elemento 1"/"Elemento 2") todavía no persistidos.
  await pagina.waitForTimeout(700);

  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Cobertura de vacunación');
  await pagina.getByTestId('indicador-definicion').fill('Porcentaje de la población objetivo vacunada.');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Mensual');
  await pagina.getByTestId('desagregacion-Zona').check();
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Cobertura de vacunación')).toBeVisible();
});

test('la grilla de Metas reemplaza las tarjetas: agregar una fila y ver el selector de Desagregación con etiquetas legibles', async () => {
  await pagina.getByTestId('indicador-Cobertura de vacunación').click();
  await expect(pagina.getByTestId('tabla-metas')).toBeVisible();

  await pagina.getByTestId('agregar-meta').click();
  await expect(pagina.getByTestId('tabla-metas').locator('tbody tr')).toHaveCount(1);

  // Por defecto la meta nueva es General — el selector debe mostrar la
  // etiqueta legible, no el texto técnico "GENERAL".
  await expect(await opcionSeleccionada(pagina, 'meta-desagregacion-0')).toBe('General (todo el indicador)');

  // Las opciones de detalle deben listar la desagregación con nombre real de lista + elemento, no `<listaId>=<codigo>`.
  const opciones = await pagina.getByTestId('meta-desagregacion-0').locator('option').allTextContents();
  expect(opciones).toContain('Zona: Norte');
  expect(opciones).toContain('Zona: Sur');
});

test('pegar filas desde Excel actualiza la fila pegada y crea filas nuevas para las que excedan', async () => {
  const textoPortapapeles = ['80\t2028\tTrimestral\tZona: Sur\tSumatoria', '120\t2029\tAnual\tGeneral (todo el indicador)\tMaximo'].join('\n');
  await pegarEnCelda(pagina, 'meta-valor-0', textoPortapapeles);

  await expect(pagina.getByTestId('tabla-metas').locator('tbody tr')).toHaveCount(2);

  await expect(pagina.getByTestId('meta-valor-0')).toHaveValue('80');
  await expect(pagina.getByTestId('meta-anio-0')).toHaveValue('2028');
  await expect(pagina.getByTestId('meta-periodicidad-0')).toHaveValue('Trimestral');
  await expect(await opcionSeleccionada(pagina, 'meta-desagregacion-0')).toBe('Zona: Sur');
  await expect(pagina.getByTestId('meta-metodo-0')).toHaveValue('Sumatoria');

  await expect(pagina.getByTestId('meta-valor-1')).toHaveValue('120');
  await expect(pagina.getByTestId('meta-anio-1')).toHaveValue('2029');
  await expect(pagina.getByTestId('meta-periodicidad-1')).toHaveValue('Anual');
  await expect(await opcionSeleccionada(pagina, 'meta-desagregacion-1')).toBe('General (todo el indicador)');
  await expect(pagina.getByTestId('meta-metodo-1')).toHaveValue('Maximo');
});

test('eliminar una fila de la grilla la quita de la tabla', async () => {
  await pagina.getByTestId('eliminar-meta-1').click();
  await expect(pagina.getByTestId('tabla-metas').locator('tbody tr')).toHaveCount(1);
  await expect(pagina.getByTestId('meta-valor-0')).toHaveValue('80');
});
