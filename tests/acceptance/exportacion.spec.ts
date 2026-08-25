import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch X — X13: el botón de Exportación ya no solo regenera el archivo en
 * el servidor (mostrando su ruta) — se renombra a "Descargar los datos" y
 * dispara una descarga real al navegador del CSV recién generado.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('exportacion');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test('el botón "Descargar los datos" descarga un CSV real con los datos analíticos', async () => {
  await pagina.getByTestId('nav-exportacion').click();
  await expect(pagina.getByTestId('descargar-export')).toBeVisible();
  await expect(pagina.getByTestId('descargar-export')).toContainText('Descargar los datos');

  const [descarga] = await Promise.all([
    pagina.waitForEvent('download'),
    pagina.getByTestId('descargar-export').click()
  ]);

  expect(descarga.suggestedFilename()).toBe('ResultadosAnalitico.csv');
  const flujo = await descarga.createReadStream();
  const trozos: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    flujo?.on('data', (t: Buffer) => trozos.push(t));
    flujo?.on('end', () => resolve());
    flujo?.on('error', reject);
  });
  const contenido = Buffer.concat(trozos).toString('utf-8');
  expect(contenido).toContain('resultado_id');
  expect(contenido).toContain('indicador');

  await expect(pagina.getByTestId('descargar-export')).toContainText('Descargar los datos');
});
