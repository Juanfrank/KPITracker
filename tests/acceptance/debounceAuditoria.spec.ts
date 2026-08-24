import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch U8: antes de este fix, `ListasPage.actualizarElemento` e
 * `IndicadoresPage.actualizarMeta` escribían al servidor en cada `onChange`
 * sin buffer — tipear un nombre letra por letra generaba una fila de
 * auditoría por carácter. Esta prueba reproduce el flujo de tecleo real
 * (`pressSequentially`, sin `.fill()`) y verifica que, tras la pausa del
 * debounce, solo quedó UNA escritura de red por edición, no una por tecla.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('debounce-auditoria');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('tipear rápido el nombre de un elemento de lista genera una sola fila de auditoría, no una por tecla', async () => {
  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('nueva-lista').click();
  await pagina.getByTestId('lista-nombre').fill('Lista debounce');
  await pagina.getByTestId('lista-prefijo').fill('DEB');
  await pagina.getByTestId('guardar-lista').click();
  await pagina.getByTestId('lista-Lista debounce').click();

  // agregarElemento ya escribe de inmediato (fila "Elemento 1"): 1 fila de auditoría.
  await pagina.getByTestId('agregar-elemento').click();

  // Tecleo letra por letra, sin pausas artificiales — antes del fix, cada
  // tecla disparaba su propia escritura de red.
  const campoNombre = pagina.getByTestId('elemento-nombre-1');
  await campoNombre.click();
  await campoNombre.fill('');
  await campoNombre.pressSequentially('Provincia', { delay: 40 });

  // Espera a que el debounce (500ms desde la última tecla) se materialice.
  await pagina.waitForTimeout(900);

  await pagina.getByTestId('nav-auditoria').click();
  await pagina.locator('.toolbar select').selectOption('ElementoLista');

  const filas = pagina.locator('[data-testid="tabla-auditoria"] tbody tr');
  // 1 fila por la creación inicial ("Elemento 1") + 1 sola fila por el
  // renombrado completo a "Provincia" — nunca una fila por cada una de las 9 teclas.
  await expect(filas).toHaveCount(2);
});
