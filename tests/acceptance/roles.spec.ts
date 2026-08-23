import { test, expect } from '@playwright/test';
import type { Browser, Locator, Page } from '@playwright/test';
import { ADMIN_PASSWORD, ADMIN_USUARIO, abrirServidorWeb } from './fixtures';

/**
 * Prueba de aceptación del sistema de roles/permisos configurable (Batch T):
 * roles de EQUIPO definidos a mano por el administrador (no un enum fijo de
 * 3 roles) con distintos permisos, visibilidad de Seguimiento restringida al
 * equipo del usuario, gating de registro de resultados, y el flujo de
 * aprobación (validar un resultado, reeditarlo y verificar que vuelve a
 * "Pendiente" — la decisión confirmada con el usuario para esta ronda).
 */

let admin: Page;
let baseUrl: string;
let cerrarApp: () => Promise<void>;
let browser: Browser;

const PASSWORD = 'ventas12345';

test.beforeAll(async () => {
  const servidor = await abrirServidorWeb('roles');
  admin = servidor.pagina;
  baseUrl = servidor.baseUrl;
  cerrarApp = servidor.cerrar;
  browser = admin.context().browser()!;

  await admin.goto(baseUrl);
  await admin.getByTestId('login-usuario').fill(ADMIN_USUARIO);
  await admin.getByTestId('login-password').fill(ADMIN_PASSWORD);
  await admin.getByTestId('login-enviar').click();
  await admin.getByTestId('pagina-seguimiento').waitFor();
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

/** Abre una sesión real independiente (su propio contexto/cookies) contra el mismo servidor. */
async function iniciarSesionComo(usuario: string, password: string): Promise<Page> {
  const contexto = await browser.newContext();
  const pagina = await contexto.newPage();
  await pagina.goto(baseUrl);
  await pagina.getByTestId('login-usuario').fill(usuario);
  await pagina.getByTestId('login-password').fill(password);
  await pagina.getByTestId('login-enviar').click();
  await pagina.getByTestId('pagina-seguimiento').waitFor();
  return pagina;
}

/**
 * Los `<select>` de Equipo (jerárquico, con guiones de indentación por
 * nivel) rotulan las opciones raíz con un espacio en blanco inicial en vez
 * de texto limpio — en vez de depender de ese formato exacto, se localiza
 * la `<option>` por el texto del equipo y se lee su `value` real.
 */
async function seleccionarPorTexto(select: Locator, texto: string): Promise<void> {
  const opcion = select.locator('option', { hasText: texto });
  const valor = await opcion.getAttribute('value');
  await select.selectOption(valor!);
}

let visor: Page;
let colaborador: Page;
let lider: Page;

test('admin crea un equipo, un responsable vinculado y dos indicadores (uno del equipo, otro "General")', async () => {
  await admin.getByTestId('nav-admin').click();

  await admin.getByTestId('nuevo-equipo').click();
  await admin.getByTestId('equipo-nombre').fill('Equipo Ventas');
  await admin.getByTestId('guardar-equipo').click();
  await expect(admin.getByTestId('equipo-Equipo Ventas')).toBeVisible();

  await admin.getByTestId('nuevo-responsable').click();
  await admin.getByTestId('responsable-nombre').fill('Responsable Ventas');
  await seleccionarPorTexto(admin.getByTestId('responsable-equipo'), 'Equipo Ventas');
  await admin.getByTestId('guardar-responsable').click();
  await expect(admin.getByTestId('responsable-Responsable Ventas')).toBeVisible();

  await admin.getByTestId('nav-indicadores').click();

  await admin.getByTestId('nuevo-indicador').click();
  await admin.getByTestId('indicador-nombre').fill('Indicador Ventas');
  await admin.getByTestId('indicador-definicion').fill('Indicador vinculado al Equipo Ventas vía su responsable.');
  await admin.getByTestId('indicador-responsable').selectOption({ label: 'Responsable Ventas' });
  await admin.getByTestId('guardar-indicador').click();
  await expect(admin.getByTestId('indicador-Indicador Ventas')).toBeVisible();

  // Sin tocar Responsable/Equipo ni Categoría: queda con el default obligatorio "General" (T1).
  await admin.getByTestId('nuevo-indicador').click();
  await admin.getByTestId('indicador-nombre').fill('Indicador General');
  await admin.getByTestId('indicador-definicion').fill('Queda en el equipo "General" por defecto, fuera de Equipo Ventas.');
  await admin.getByTestId('guardar-indicador').click();
  await expect(admin.getByTestId('indicador-Indicador General')).toBeVisible();
});

test('admin crea tres roles de EQUIPO configurables a mano, con permisos crecientes', async () => {
  await admin.getByTestId('nav-admin').click();

  const crearRolDeEquipo = async (nombre: string, permisos: string[]): Promise<void> => {
    await admin.getByTestId('nuevo-rol-equipo').click();
    await admin.getByTestId('rol-nombre').fill(nombre);
    for (const permiso of permisos) await admin.getByTestId(`rol-permiso-${permiso}`).check();
    await admin.getByTestId('guardar-rol').click();
    await expect(admin.getByTestId(`rol-${nombre}`)).toBeVisible();
  };

  await crearRolDeEquipo('Visor Ventas', ['resultados.ver.equipo']);
  await crearRolDeEquipo('Colaborador Ventas', ['resultados.ver.equipo', 'resultados.registrar.equipo']);
  await crearRolDeEquipo('Líder Ventas', ['resultados.ver.equipo', 'resultados.registrar.equipo', 'resultados.validar.equipo']);
});

test('admin crea tres usuarios y los asigna a Equipo Ventas con su rol de equipo respectivo', async () => {
  const crearUsuario = async (nombreUsuario: string, rolEquipo: string): Promise<void> => {
    await admin.getByTestId('nuevo-usuario').click();
    await admin.getByTestId('usuario-nombreUsuario').fill(nombreUsuario);
    await admin.locator('div.campo', { has: admin.locator('label', { hasText: 'Nombre completo' }) })
      .locator('input')
      .fill(nombreUsuario);
    await admin.getByTestId('usuario-password').fill(PASSWORD);
    await admin.getByTestId('guardar-usuario').click();
    await expect(admin.getByTestId(`usuario-${nombreUsuario}`)).toBeVisible();

    await admin.getByTestId(`usuario-${nombreUsuario}`).click();
    await seleccionarPorTexto(admin.getByTestId('usuario-equipo'), 'Equipo Ventas');
    await admin.getByTestId('usuario-rol-equipo').selectOption({ label: rolEquipo });
    await admin.getByTestId('guardar-usuario-edicion').click();
    await expect(admin.getByTestId(`usuario-${nombreUsuario}`)).toBeVisible();
  };

  await admin.getByTestId('nav-admin').click();
  await crearUsuario('visor.ventas', 'Visor Ventas');
  await crearUsuario('colaborador.ventas', 'Colaborador Ventas');
  await crearUsuario('lider.ventas', 'Líder Ventas');
});

test('un usuario con solo "resultados.registrar.equipo" (heredado de "ver") registra el resultado inicial de SU equipo', async () => {
  colaborador = await iniciarSesionComo('colaborador.ventas', PASSWORD);

  await colaborador.getByTestId('nav-recoleccion').click();
  // Filtrado por permisos (T4): solo ve el indicador de su equipo, nunca "Indicador General".
  await expect(colaborador.getByTestId('recoleccion-indicador').locator('option')).toHaveCount(2);
  await colaborador.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador Ventas' });
  await colaborador.getByTestId('recoleccion-periodo').selectOption({ index: 1 });
  await expect(colaborador.getByTestId('grilla-captura')).toBeVisible();

  await colaborador.getByTestId('recoleccion-fecha-corte').fill('2026-08-23');
  await expect(colaborador.getByTestId('celda-GENERAL')).toBeEnabled();
  await colaborador.getByTestId('celda-GENERAL').fill('100');
  await colaborador.getByTestId('celda-GENERAL').press('Tab');
  await expect(colaborador.getByTestId('validacion-GENERAL')).toHaveText('Pendiente');
});

test('un usuario con solo "resultados.ver.equipo" ve el indicador de su equipo (y solo ese) pero no puede registrar ni validar', async () => {
  visor = await iniciarSesionComo('visor.ventas', PASSWORD);

  await expect(visor.getByTestId('seguimiento-Indicador Ventas')).toBeVisible();
  await expect(visor.getByTestId('seguimiento-Indicador General')).toHaveCount(0);

  await visor.getByTestId('nav-recoleccion').click();
  await expect(visor.getByTestId('recoleccion-indicador').locator('option')).toHaveCount(2);
  await visor.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador Ventas' });
  await visor.getByTestId('recoleccion-periodo').selectOption({ index: 1 });
  // La fecha de corte ya la estableció el colaborador — la celda queda habilitada para escribir,
  // pero el gating real vive en el servicio (`indicadorConPermiso`), no en el disabled del input.
  await expect(visor.getByTestId('celda-GENERAL')).toHaveValue('100');
  await visor.getByTestId('celda-GENERAL').fill('999');
  await visor.getByTestId('celda-GENERAL').press('Tab');
  await expect(visor.getByTestId('celda-GENERAL')).toHaveClass(/invalido/);

  await visor.getByTestId('validar-GENERAL').click();
  await expect(visor.getByTestId('error-validacion')).toBeVisible();
});

test('un usuario con "resultados.validar.equipo" puede validar el resultado; reeditar el valor lo regresa a "Pendiente"', async () => {
  lider = await iniciarSesionComo('lider.ventas', PASSWORD);

  await lider.getByTestId('nav-recoleccion').click();
  await lider.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador Ventas' });
  await lider.getByTestId('recoleccion-periodo').selectOption({ index: 1 });
  await expect(lider.getByTestId('celda-GENERAL')).toHaveValue('100');

  await lider.getByTestId('validar-GENERAL').click();
  await expect(lider.getByTestId('validacion-GENERAL')).toHaveText('Validado');

  // Reeditar el valor ya validado (con el usuario colaborador, sesión abierta desde el test anterior)
  // debe reiniciar el estado de validación a "Pendiente" — decisión confirmada con el usuario.
  await colaborador.getByTestId('celda-GENERAL').fill('120');
  await colaborador.getByTestId('celda-GENERAL').press('Tab');
  await expect(colaborador.getByTestId('validacion-GENERAL')).toHaveText('Pendiente');
});
