import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Recolección usa un store (Zustand) que es un singleton de módulo: sobrevive
 * a navegar a otra página y volver. Antes de este fix, su captura del
 * período seguía siendo la de antes de irse — si mientras tanto se agregaba
 * un elemento a una lista usada por la desagregación del indicador
 * seleccionado, la fila nueva no aparecía sin volver a seleccionar el
 * indicador a mano (o cerrar y reabrir la app). Esta prueba reproduce
 * exactamente ese flujo: seleccionar indicador en Recolección, agregar un
 * elemento a su lista desde otra página, y volver a Recolección SIN tocar
 * el selector de indicador — la fila nueva debe aparecer sola.
 */

let aplicacion: ElectronApplication;
let pagina: Page;
let dataDir: string;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-e2e-actualizacion-listas-'));
  aplicacion = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, KPITRACKER_DATA_DIR: dataDir, ELECTRON_DISABLE_SANDBOX: '1' }
  });
  pagina = await aplicacion.firstWindow();
  await pagina.setViewportSize({ width: 1440, height: 900 });
  await pagina.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await aplicacion.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test.describe.configure({ mode: 'serial' });

test('un elemento agregado a una lista en otra página aparece en Recolección al volver, sin reseleccionar el indicador', async () => {
  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('nueva-lista').click();
  await pagina.getByTestId('lista-nombre').fill('Sexo (actualización)');
  await pagina.getByTestId('lista-prefijo').fill('SXU');
  await pagina.getByTestId('guardar-lista').click();
  await pagina.getByTestId('lista-Sexo (actualización)').click();
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-nombre-1').fill('Masculino');

  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador actualización de listas');
  await pagina.getByTestId('indicador-definicion').fill('Prueba de refresco de listas en Recolección.');
  await pagina.getByTestId('desagregacion-Sexo (actualización)').check();
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador actualización de listas')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador actualización de listas' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  const filasAntes = pagina.locator('[data-testid="grilla-captura"] tbody tr');
  await expect(filasAntes).toHaveCount(2); // General + Masculino

  // Se agrega un segundo elemento a la lista SIN pasar por Recolección de nuevo todavía.
  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('lista-Sexo (actualización)').click();
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-nombre-2').fill('Femenino');

  // Vuelve a Recolección por el nav normal (sin indicadorId en la navegación): el
  // indicador seleccionado sigue siendo el mismo en el store, pero la captura debe
  // refrescarse sola y mostrar la fila nueva.
  await pagina.getByTestId('nav-recoleccion').click();
  await expect(pagina.getByTestId('recoleccion-indicador')).toHaveValue(/./); // sigue con un indicador seleccionado
  const filasDespues = pagina.locator('[data-testid="grilla-captura"] tbody tr');
  await expect(filasDespues).toHaveCount(3); // General + Masculino + Femenino
});
