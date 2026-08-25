import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb, seleccionarBuscable } from './fixtures';

/**
 * Batch X — X12: los dropdowns de "Responsable / Equipo" y "Categoría" en
 * Indicadores ganan un buscador (combobox: input de texto + panel flotante
 * filtrado, `SelectorBuscable`), y el de Categoría muestra la jerarquía
 * entre categorías (indentación por nivel + conector "└").
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('selector-buscable');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('preparación: dos usuarios (responsables) y una categoría con una subcategoría', async () => {
  await pagina.getByTestId('nav-admin').click();

  await pagina.getByTestId('nuevo-usuario').click();
  await pagina.getByTestId('usuario-nombreUsuario').fill('ana.buscable');
  await pagina.getByTestId('usuario-nombreCompleto').fill('Ana Buscable');
  await pagina.getByTestId('usuario-password').fill('contrasenaSegura1');
  await pagina.getByTestId('guardar-usuario').click();
  await expect(pagina.getByTestId('usuario-ana.buscable')).toBeVisible();

  await pagina.getByTestId('nuevo-usuario').click();
  await pagina.getByTestId('usuario-nombreUsuario').fill('bruno.otro');
  await pagina.getByTestId('usuario-nombreCompleto').fill('Bruno Otro');
  await pagina.getByTestId('usuario-password').fill('contrasenaSegura1');
  await pagina.getByTestId('guardar-usuario').click();
  await expect(pagina.getByTestId('usuario-bruno.otro')).toBeVisible();

  await pagina.getByTestId('nueva-categoria').click();
  await pagina.getByTestId('categoria-nombre').fill('Salud');
  await pagina.getByTestId('guardar-categoria').click();
  await expect(pagina.getByTestId('categoria-Salud')).toBeVisible();

  await pagina.getByTestId('nueva-categoria').click();
  await pagina.getByTestId('categoria-nombre').fill('Vacunación');
  await pagina.getByTestId('categoria-padre').selectOption({ label: 'Salud' });
  await pagina.getByTestId('guardar-categoria').click();
  await expect(pagina.getByTestId('categoria-Vacunación')).toBeVisible();
});

test('el buscador de "Responsable / Equipo" filtra por texto y solo muestra el resultado que coincide', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador con buscador');
  await pagina.getByTestId('indicador-definicion').fill('Prueba de SelectorBuscable (Batch X, X12).');

  await pagina.getByTestId('indicador-responsable').click();
  await pagina.getByTestId('indicador-responsable').fill('Ana');
  await expect(pagina.getByTestId('indicador-responsable-opcion-Ana Buscable')).toBeVisible();
  await expect(pagina.getByTestId('indicador-responsable-opcion-Bruno Otro')).toHaveCount(0);
  await pagina.getByTestId('indicador-responsable-opcion-Ana Buscable').click();

  // Cerrado, el input vuelve a mostrar la etiqueta de lo elegido (no un id técnico).
  await expect(pagina.getByTestId('indicador-responsable')).toHaveValue('Ana Buscable');
});

test('el buscador de "Categoría" filtra por texto y muestra la jerarquía (indentación) entre categorías', async () => {
  await pagina.getByTestId('indicador-categoria').click();
  // Sin filtro: se ven ambas — la subcategoría con el conector de jerarquía "└".
  await expect(pagina.getByTestId('indicador-categoria-opcion-Salud')).toBeVisible();
  await expect(pagina.getByTestId('indicador-categoria-opcion-Vacunación')).toContainText('└');

  await pagina.getByTestId('indicador-categoria').fill('Vacun');
  await expect(pagina.getByTestId('indicador-categoria-opcion-Vacunación')).toBeVisible();
  await expect(pagina.getByTestId('indicador-categoria-opcion-Salud')).toHaveCount(0);
  await pagina.getByTestId('indicador-categoria-opcion-Vacunación').click();
  await expect(pagina.getByTestId('indicador-categoria')).toHaveValue('Vacunación');

  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador con buscador')).toBeVisible();
});

test('reabrir el indicador conserva lo elegido: el buscador muestra "Ana Buscable" y "Vacunación"', async () => {
  await pagina.getByTestId('indicador-Indicador con buscador').click();
  await expect(pagina.getByTestId('indicador-responsable')).toHaveValue('Ana Buscable');
  await expect(pagina.getByTestId('indicador-categoria')).toHaveValue('Vacunación');
  await pagina.getByTestId('cancelar-indicador').click();
});

test('sin resultados que coincidan, el panel lo informa', async () => {
  await pagina.getByTestId('indicador-Indicador con buscador').click();
  await pagina.getByTestId('indicador-responsable').click();
  await pagina.getByTestId('indicador-responsable').fill('xyz-no-existe');
  await expect(pagina.getByTestId('indicador-responsable-panel')).toContainText('Sin resultados');
  await pagina.getByTestId('indicador-responsable').press('Escape');
  await pagina.getByTestId('cancelar-indicador').click();
});
