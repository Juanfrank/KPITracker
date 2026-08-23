import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Prueba de aceptación del módulo de Equipos (Batch R): equipos
 * jerárquicos, vínculo INDIRECTO indicador↔equipo vía el responsable (el
 * selector jerárquico "Equipo > Responsables" de Indicadores) y vínculo
 * DIRECTO gestionado desde el panel de Equipos (checklist "Indicadores de
 * este equipo").
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('equipos');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('crea un equipo y un sub-equipo (jerarquía)', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-equipo').click();
  await pagina.getByTestId('equipo-nombre').fill('Dirección de Planificación');
  await pagina.getByTestId('guardar-equipo').click();
  await expect(pagina.getByTestId('equipo-Dirección de Planificación')).toBeVisible();

  await pagina.getByTestId('nuevo-equipo').click();
  await pagina.getByTestId('equipo-nombre').fill('Unidad de Estadísticas');
  await pagina.getByTestId('equipo-padre').selectOption({ label: 'Dirección de Planificación' });
  await pagina.getByTestId('guardar-equipo').click();
  await expect(pagina.getByTestId('equipo-Unidad de Estadísticas')).toBeVisible();
});

test('crea un responsable y lo asigna a un equipo', async () => {
  await pagina.getByTestId('nuevo-responsable').click();
  await pagina.getByTestId('responsable-nombre').fill('Responsable de Estadísticas');
  await pagina.getByTestId('responsable-equipo').selectOption({ label: '— Unidad de Estadísticas' });
  await pagina.getByTestId('guardar-responsable').click();
  await expect(pagina.getByTestId('responsable-Responsable de Estadísticas')).toBeVisible();
});

test('un indicador con ese responsable queda vinculado indirectamente al equipo', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador vía responsable');
  await pagina.getByTestId('indicador-definicion').fill('Vínculo indirecto por responsable.');
  await pagina.getByTestId('indicador-responsable').selectOption({ label: 'Responsable de Estadísticas' });
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador vía responsable')).toBeVisible();

  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('equipo-Unidad de Estadísticas').click();
  const fila = pagina.getByTestId('equipo-indicador-Indicador vía responsable');
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('Indirecto');
  const casilla = pagina.getByTestId('equipo-indicador-check-Indicador vía responsable');
  await expect(casilla).toBeChecked();
  await expect(casilla).toBeDisabled();
  await pagina.getByRole('button', { name: 'Cancelar' }).click();
});

test('vincular un indicador directo desde el panel de Equipos lo muestra como "Todo el equipo" en Indicadores', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador vínculo directo');
  await pagina.getByTestId('indicador-definicion').fill('Se vincula directo desde el panel de Equipos.');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador vínculo directo')).toBeVisible();

  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('equipo-Unidad de Estadísticas').click();
  const casilla = pagina.getByTestId('equipo-indicador-check-Indicador vínculo directo');
  // Un solo click (no `.check()`, cuyo propio reintento de click puede alternar
  // dos veces mientras el estado tarda en llegar del servidor) y se espera la
  // aserción, que sí reintenta sin volver a hacer click.
  await casilla.click();
  await expect(casilla).toBeChecked();
  await expect(casilla).toBeEnabled();
  const filaDirecta = pagina.getByTestId('equipo-indicador-Indicador vínculo directo');
  await expect(filaDirecta).toContainText('Directo');
  await pagina.getByRole('button', { name: 'Cancelar' }).click();

  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('indicador-Indicador vínculo directo').click();
  const seleccionado = pagina.locator('[data-testid="indicador-responsable"] option:checked');
  await expect(seleccionado).toHaveText('— Todo el equipo —');
  await pagina.getByRole('button', { name: 'Cancelar' }).click();
});

test('Seguimiento — vista "Árbol (Equipo)" agrupa los indicadores por Equipo > Sub-equipo > Categoría', async () => {
  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('vista-equipo').click();

  const tabla = pagina.getByTestId('tabla-seguimiento-equipo');
  await expect(tabla).toBeVisible();
  // Jerarquía completa visible por defecto (nada colapsado): equipo raíz, su
  // sub-equipo, y ambos indicadores (vinculados a "Unidad de Estadísticas",
  // uno directo y otro indirecto vía su responsable) bajo "Sin categoría".
  await expect(pagina.getByTestId('seguimiento-equipo-equipo-Dirección de Planificación')).toBeVisible();
  await expect(pagina.getByTestId('seguimiento-equipo-equipo-Unidad de Estadísticas')).toBeVisible();
  await expect(pagina.getByTestId('seguimiento-Indicador vía responsable')).toBeVisible();
  await expect(pagina.getByTestId('seguimiento-Indicador vínculo directo')).toBeVisible();

  // Colapsar el sub-equipo oculta sus indicadores; expandir los devuelve.
  await pagina.getByTestId('colapsar-equipo-equipo-Unidad de Estadísticas').click();
  await expect(pagina.getByTestId('seguimiento-Indicador vía responsable')).toHaveCount(0);
  await expect(pagina.getByTestId('seguimiento-Indicador vínculo directo')).toHaveCount(0);
  // El equipo raíz sigue visible — solo se ocultó lo anidado bajo el sub-equipo colapsado.
  await expect(pagina.getByTestId('seguimiento-equipo-equipo-Dirección de Planificación')).toBeVisible();

  await pagina.getByTestId('colapsar-equipo-equipo-Unidad de Estadísticas').click();
  await expect(pagina.getByTestId('seguimiento-Indicador vía responsable')).toBeVisible();
  await expect(pagina.getByTestId('seguimiento-Indicador vínculo directo')).toBeVisible();
});
