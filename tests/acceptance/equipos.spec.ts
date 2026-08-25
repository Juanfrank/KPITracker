import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb, seleccionarBuscable } from './fixtures';

/**
 * Prueba de aceptación del módulo de Equipos (Batch R): equipos
 * jerárquicos, vínculo INDIRECTO indicador↔equipo vía el responsable (el
 * selector jerárquico "Equipo > Responsables" de Indicadores) y vínculo
 * DIRECTO gestionado desde el panel de Equipos (checklist "Indicadores de
 * este equipo"). Batch U unificó Usuario/Responsable: el responsable ahora
 * es un Usuario (creado en la sección "Usuarios" de Administración; su
 * equipo se asigna al editarlo, no al crearlo).
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

test('crea un usuario (responsable) y lo asigna a un equipo', async () => {
  await pagina.getByTestId('nuevo-usuario').click();
  await pagina.getByTestId('usuario-nombreUsuario').fill('resp-estadisticas');
  await pagina.getByTestId('usuario-nombreCompleto').fill('Responsable de Estadísticas');
  await pagina.getByTestId('usuario-password').fill('contrasenaSegura1');
  await pagina.getByTestId('guardar-usuario').click();
  await expect(pagina.getByTestId('usuario-resp-estadisticas')).toBeVisible();

  await pagina.getByTestId('usuario-resp-estadisticas').click();
  await pagina.getByTestId('usuario-equipo').selectOption({ label: '— Unidad de Estadísticas' });
  await pagina.getByTestId('guardar-usuario-edicion').click();
});

test('un indicador con ese responsable queda vinculado indirectamente al equipo', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador vía responsable');
  await pagina.getByTestId('indicador-definicion').fill('Vínculo indirecto por responsable.');
  await seleccionarBuscable(pagina, 'indicador-responsable', 'Responsable de Estadísticas', 'Responsable de Estadísticas');
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
  await expect(pagina.getByTestId('indicador-responsable')).toHaveValue('— Todo el equipo —');
  await pagina.getByRole('button', { name: 'Cancelar' }).click();
});

test('la tabla de Equipos muestra el conector de jerarquía y el conteo de indicadores (propios + heredados)', async () => {
  await pagina.getByTestId('nav-admin').click();

  const filaSubEquipo = pagina.getByTestId('equipo-Unidad de Estadísticas');
  // Conector visual (U4) antes del nombre, en la fila anidada (nivel > 0).
  await expect(filaSubEquipo.locator('td').first()).toContainText('└');
  // 2 indicadores propios (uno directo, otro indirecto vía responsable).
  await expect(filaSubEquipo.locator('td').nth(2)).toHaveText('2');

  // "Dirección de Planificación" (equipo raíz, sin indicadores propios) hereda
  // el conteo de su sub-equipo.
  const filaRaiz = pagina.getByTestId('equipo-Dirección de Planificación');
  await expect(filaRaiz.locator('td').first()).not.toContainText('└');
  await expect(filaRaiz.locator('td').nth(2)).toHaveText('2');
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

test('Seguimiento → Histórico gana el mismo selector "Ver como" y agrupa igual por Equipo/Categoría (U5b)', async () => {
  await pagina.getByTestId('pestana-historico').click();
  // Por defecto sigue en "Lista" (no rompe los E2E existentes que dependen de eso).
  await expect(pagina.getByTestId('tabla-historico')).toBeVisible();
  await expect(pagina.getByTestId('historico-Indicador vía responsable')).toBeVisible();

  await pagina.getByTestId('vista-historico-equipo').click();
  const tabla = pagina.getByTestId('tabla-historico-equipo');
  await expect(tabla).toBeVisible();
  await expect(pagina.getByTestId('historico-equipo-equipo-Dirección de Planificación')).toBeVisible();
  await expect(pagina.getByTestId('historico-equipo-equipo-Unidad de Estadísticas')).toBeVisible();
  await expect(pagina.getByTestId('historico-Indicador vía responsable')).toBeVisible();
  await expect(pagina.getByTestId('historico-Indicador vínculo directo')).toBeVisible();

  await pagina.getByTestId('vista-historico-arbol').click();
  await expect(pagina.getByTestId('tabla-historico-arbol')).toBeVisible();
  // Sin categoría explícita, T1 los clasifica en la categoría raíz "General" (respaldo obligatorio).
  await expect(pagina.getByTestId('historico-arbol-categoria-General')).toBeVisible();
  await expect(pagina.getByTestId('historico-Indicador vía responsable')).toBeVisible();
});
