import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Prueba de aceptación del borrado lógico (Batch M): un usuario (responsable
 * de un indicador — Batch U unificó Usuario/Responsable) en uso no puede
 * eliminarse (el aviso muestra qué indicador lo usa); una vez desasignado,
 * eliminarlo lo oculta de la lista; "Mostrar eliminados" lo revela atenuado,
 * y "Restaurar" lo devuelve a la lista normal.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('borrado-logico');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('un usuario asignado a un indicador como responsable no puede eliminarse; el aviso indica cuál lo usa', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-usuario').click();
  await pagina.getByTestId('usuario-nombreUsuario').fill('eliminable');
  await pagina.getByTestId('usuario-nombreCompleto').fill('Usuario eliminable');
  await pagina.getByTestId('usuario-password').fill('contrasenaSegura1');
  await pagina.getByTestId('guardar-usuario').click();
  await expect(pagina.getByTestId('usuario-eliminable')).toBeVisible();

  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador con responsable');
  await pagina.getByTestId('indicador-definicion').fill('Indicador de prueba para borrado lógico.');
  await pagina.getByTestId('indicador-responsable').selectOption({ label: 'Usuario eliminable' });
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador con responsable')).toBeVisible();

  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('usuario-eliminable').click();
  await pagina.getByRole('button', { name: 'Eliminar' }).click();
  const error = pagina.getByTestId('usuario-error-eliminar');
  await expect(error).toBeVisible();
  await expect(error).toContainText('Indicador con responsable');
  await pagina.getByRole('button', { name: 'Cancelar' }).click();
});

test('desasignado, eliminar oculta al usuario; "Mostrar eliminados" lo revela y "Restaurar" lo devuelve', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('indicador-Indicador con responsable').click();
  // Batch T: Responsable/Equipo ahora es obligatorio (ya no hay "— sin asignar —") — se
  // "desasigna" reasignando al vínculo directo con el equipo "General" (el único equipo
  // que existe en este spec), en vez de una persona puntual.
  await pagina.getByTestId('indicador-responsable').selectOption({ label: '— Todo el equipo —' });
  await pagina.getByTestId('guardar-indicador').click();

  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('usuario-eliminable').click();
  await pagina.getByRole('button', { name: 'Eliminar' }).click();
  await expect(pagina.getByTestId('usuario-eliminable')).toHaveCount(0);

  await pagina.getByTestId('usuarios-mostrar-eliminados').check();
  const fila = pagina.getByTestId('usuario-eliminable');
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('Eliminado');

  await fila.getByRole('button', { name: 'Restaurar' }).click();
  await pagina.getByTestId('usuarios-mostrar-eliminados').uncheck();
  await expect(pagina.getByTestId('usuario-eliminable')).toBeVisible();
});
