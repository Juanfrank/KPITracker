import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch AU (pedido explícito del usuario): clic en una celda de período de
 * Histórico abre el detalle completo de ESE dato puntual — valor +
 * desagregaciones, quién/cuándo lo capturó y lo validó, comentario del
 * levantamiento y evidencia adjunta — con un lápiz que navega a Recolección
 * para ese indicador+período exacto.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('celda-detalle-historico');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

const anio = new Date().getFullYear();
const periodoId = `${anio}-Mensual-01`;

test('preparación: indicador con resultado capturado, comentario y validado', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador Detalle AU');
  await pagina.getByTestId('indicador-definicion').fill('Para probar el detalle de celda de Histórico (Batch AU).');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Mensual');
  await pagina.getByTestId('indicador-meta').fill('100');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador Detalle AU')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador Detalle AU' });
  await pagina.getByTestId('recoleccion-periodo').selectOption({ label: `Enero ${anio}` });
  await pagina.getByTestId('recoleccion-fecha-corte').fill(`${anio}-01-31`);
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.getByTestId('celda-GENERAL').fill('77');
  await pagina.getByTestId('celda-GENERAL').press('Enter');
  await pagina.waitForTimeout(1000);

  await pagina.getByTestId('resumen-comentario-evidencia').click();
  await pagina.getByTestId('recoleccion-comentario').fill('Comentario de prueba AU.');
  await pagina.getByTestId('recoleccion-comentario').blur();
  await pagina.waitForTimeout(500);

  await pagina.getByTestId('validar-GENERAL').click();
  await expect(pagina.getByTestId('validacion-GENERAL')).toContainText('Validado');
});

test('clic en la celda de período abre el panel con el detalle completo', async () => {
  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await expect(pagina.getByTestId('tabla-historico')).toBeVisible();

  await pagina.getByTestId(`historico-Indicador Detalle AU-${periodoId}`).click();
  const panel = pagina.getByTestId('celda-detalle-tabla');
  await expect(panel).toBeVisible();

  const fila = pagina.getByTestId('celda-detalle-fila-GENERAL');
  await expect(fila).toContainText('General');
  await expect(fila).toContainText('77');
  await expect(fila).toContainText('Validado');
  // Capturado por el administrador (usuario de la sesión de este test) — no 'local' ni vacío.
  await expect(fila).toContainText('Administrador');

  await expect(pagina.getByText('Comentario de prueba AU.')).toBeVisible();
});

test('el lápiz "Editar en Recolección" navega al indicador y período exactos', async () => {
  await pagina.getByTestId('celda-detalle-editar').click();
  await expect(pagina).toHaveURL(new RegExp(`/recoleccion\\?indicadorId=.*&periodoId=${periodoId}`));
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
});
