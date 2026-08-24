import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Prueba de aceptación de "Ver como" (Batch U, U2): un administrador elige
 * un usuario y navega la app viendo exactamente lo que ese usuario vería —
 * de solo lectura, con un banner persistente para salir.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('ver-como');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('el admin crea un usuario no-administrador', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-usuario').click();
  await pagina.getByTestId('usuario-nombreUsuario').fill('ana');
  await pagina.getByTestId('usuario-nombreCompleto').fill('Ana Martínez');
  await pagina.getByTestId('usuario-password').fill('contrasenaSegura1');
  await pagina.getByTestId('guardar-usuario').click();
  await expect(pagina.getByTestId('usuario-ana')).toBeVisible();
});

test('"Ver como" activa la simulación: banner visible y navega a Seguimiento', async () => {
  await pagina.getByTestId('ver-como-ana').click();
  await expect(pagina).toHaveURL(/\/seguimiento$/);
  const banner = pagina.getByTestId('banner-ver-como');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Ana Martínez');
});

test('mientras se simula, una mutación (crear una lista) no persiste — modo solo lectura', async () => {
  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('nueva-lista').click();
  await pagina.getByTestId('lista-nombre').fill('No debería crearse');
  await pagina.getByTestId('lista-prefijo').fill('NDC');
  await pagina.getByTestId('guardar-lista').click();
  // El servidor rechaza la mutación (FORBIDDEN) — la lista nunca se persiste; se cierra el
  // panel a mano (el formulario no muestra el error de por sí, ver `ListasPage.guardarLista`).
  await pagina.getByRole('button', { name: 'Cancelar' }).click();
  await expect(pagina.getByTestId('lista-No debería crearse')).toHaveCount(0);
});

test('"Salir" termina la simulación: el banner desaparece y vuelve la identidad del administrador', async () => {
  await pagina.getByTestId('salir-ver-como').click();
  await expect(pagina.getByTestId('banner-ver-como')).toHaveCount(0);

  // Prueba de que la identidad real (admin) volvió: puede administrar usuarios de nuevo.
  await pagina.getByTestId('nav-admin').click();
  await expect(pagina.getByTestId('nuevo-usuario')).toBeVisible();

  // Y las mutaciones vuelven a funcionar con normalidad.
  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('nueva-lista').click();
  await pagina.getByTestId('lista-nombre').fill('Ahora sí se crea');
  await pagina.getByTestId('lista-prefijo').fill('ASC');
  await pagina.getByTestId('guardar-lista').click();
  await expect(pagina.getByTestId('lista-Ahora sí se crea')).toBeVisible();
});
