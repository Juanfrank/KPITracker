import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch U9: el bloque "Comentario del levantamiento" + "Evidencia adjunta"
 * de Recolección vive dentro de un panel colapsable, cerrado por defecto,
 * con un resumen ("💬 con comentario" / "📎 N adjuntos") que sigue visible
 * incluso cerrado — para no perder la señal de que hay contenido sin
 * tener que desplegarlo.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('panel-comentario-evidencia');
  pagina = app.pagina;
  cerrarApp = app.cerrar;

  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador panel colapsable');
  await pagina.getByTestId('indicador-definicion').fill('Prueba del panel de comentario/evidencia.');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador panel colapsable')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador panel colapsable' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('el panel arranca colapsado y sin badges, sin comentario ni adjuntos', async () => {
  await expect(pagina.getByTestId('panel-comentario-evidencia')).not.toHaveAttribute('open', '');
  await expect(pagina.getByTestId('recoleccion-comentario')).not.toBeVisible();
  await expect(pagina.getByTestId('resumen-con-comentario')).toHaveCount(0);
  await expect(pagina.getByTestId('resumen-cantidad-adjuntos')).toHaveCount(0);
});

test('escribir un comentario muestra el badge "con comentario", incluso con el panel cerrado de nuevo', async () => {
  await pagina.getByTestId('resumen-comentario-evidencia').click();
  await expect(pagina.getByTestId('recoleccion-comentario')).toBeVisible();
  await pagina.getByTestId('recoleccion-comentario').fill('Se levantó con retraso por feriado.');
  await pagina.getByTestId('recoleccion-comentario').blur();
  await expect(pagina.getByTestId('resumen-con-comentario')).toHaveText('💬 con comentario');

  // Colapsar de nuevo: el resumen (el <summary>) sigue mostrando el badge.
  await pagina.getByTestId('resumen-comentario-evidencia').click();
  await expect(pagina.getByTestId('recoleccion-comentario')).not.toBeVisible();
  await expect(pagina.getByTestId('resumen-con-comentario')).toBeVisible();
});

test('adjuntar un archivo muestra el badge "N adjuntos"', async () => {
  await pagina.getByTestId('resumen-comentario-evidencia').click();
  await pagina.getByTestId('subir-adjunto').click();
  await pagina
    .locator('[data-testid="panel-comentario-evidencia"] input[type="file"]')
    .setInputFiles({ name: 'evidencia.txt', mimeType: 'text/plain', buffer: Buffer.from('Evidencia de prueba.') });

  await expect(pagina.getByTestId('resumen-cantidad-adjuntos')).toHaveText('📎 1 adjunto');
});
