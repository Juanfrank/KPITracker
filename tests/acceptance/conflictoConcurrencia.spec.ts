import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { abrirServidorWeb, ADMIN_PASSWORD, ADMIN_USUARIO } from './fixtures';
import type { ServidorWebE2E } from './fixtures';

/**
 * Concurrencia (bloqueo optimista, pedido explícito del usuario): "detectar
 * y bloquear con aviso de recargar" — dos pestañas que cargaron la misma
 * celda antes de que ninguna guardara. La primera guarda sin problema; la
 * segunda, al intentar guardar SU valor (con la versión ya superada),
 * recibe el rechazo y muestra el aviso de conflicto con un botón
 * "Recargar" en vez de sobrescribir en silencio.
 */

let servidor: ServidorWebE2E;
let paginaA: Page;
let paginaB: Page;

async function iniciarSesion(pagina: Page): Promise<void> {
  await pagina.goto(servidor.baseUrl);
  await pagina.getByTestId('login-usuario').fill(ADMIN_USUARIO);
  await pagina.getByTestId('login-password').fill(ADMIN_PASSWORD);
  await pagina.getByTestId('login-enviar').click();
  await pagina.getByTestId('pagina-seguimiento').waitFor();
}

async function irAIndicador(pagina: Page, nombre: string): Promise<void> {
  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: nombre });
}

test.beforeAll(async () => {
  servidor = await abrirServidorWeb('conflicto-concurrencia');
  const navegador = servidor.pagina.context().browser()!;
  paginaA = await navegador.newPage();
  paginaB = await navegador.newPage();
  await iniciarSesion(paginaA);
  await iniciarSesion(paginaB);

  // Ambas pestañas comparten la misma sesión de administrador (misma cookie de
  // navegador local != multi-usuario real, pero el mecanismo de bloqueo optimista
  // no distingue identidad de sesión — compara `actualizadoEn`, así que dos
  // pestañas de la misma persona ya alcanzan para reproducir el conflicto).
  await paginaA.getByTestId('nav-indicadores').click();
  await paginaA.getByTestId('nuevo-indicador').click();
  await paginaA.getByTestId('indicador-nombre').fill('Indicador conflicto concurrencia');
  await paginaA.getByTestId('indicador-definicion').fill('Prueba de bloqueo optimista.');
  await paginaA.getByTestId('guardar-indicador').click();
  await expect(paginaA.getByTestId('indicador-Indicador conflicto concurrencia')).toBeVisible();
});

test.afterAll(async () => {
  await paginaA.close();
  await paginaB.close();
  await servidor.cerrar();
});

test.describe.configure({ mode: 'serial' });

test('ambas pestañas abren la misma grilla de captura, vacía', async () => {
  await irAIndicador(paginaA, 'Indicador conflicto concurrencia');
  await paginaA.getByTestId('recoleccion-fecha-corte').fill('2026-01-31');
  await expect(paginaA.getByTestId('celda-GENERAL')).toHaveValue('');

  await irAIndicador(paginaB, 'Indicador conflicto concurrencia');
  await expect(paginaB.getByTestId('celda-GENERAL')).toHaveValue('');
});

test('la pestaña A guarda primero, sin problema', async () => {
  await paginaA.getByTestId('celda-GENERAL').fill('10');
  await paginaA.getByTestId('celda-GENERAL').blur();
  await expect(paginaA.getByTestId('celda-GENERAL')).toHaveValue('10');
});

test('la pestaña B, con la versión ya superada, muestra el conflicto en vez de sobrescribir', async () => {
  await paginaB.getByTestId('celda-GENERAL').fill('99');
  await paginaB.getByTestId('celda-GENERAL').blur();
  await expect(paginaB.getByTestId('conflicto-GENERAL')).toBeVisible();
  await expect(paginaB.getByTestId('conflicto-GENERAL')).toContainText('10');

  // El valor vigente en el servidor sigue siendo 10 — la pestaña B nunca lo sobrescribió.
  await irAIndicador(paginaA, 'Indicador conflicto concurrencia');
  await expect(paginaA.getByTestId('celda-GENERAL')).toHaveValue('10');
});

test('"Recargar" descarta el conflicto y trae el valor vigente, listo para volver a editar', async () => {
  await paginaB.getByTestId('recargar-GENERAL').click();
  await expect(paginaB.getByTestId('celda-GENERAL')).toHaveValue('10');

  // Ahora sí puede editar y guardar sin chocar — la versión que trajo el recargo es la vigente.
  await paginaB.getByTestId('celda-GENERAL').fill('25');
  await paginaB.getByTestId('celda-GENERAL').blur();
  await expect(paginaB.getByTestId('celda-GENERAL')).toHaveValue('25');
});
