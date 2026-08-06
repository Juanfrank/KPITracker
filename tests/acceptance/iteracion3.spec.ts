import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Prueba de aceptación de la iteración 3: pestaña Histórico de Seguimiento
 * (períodos como columnas), atributos filtrables, y la plataforma de
 * orígenes automáticos (configuración de punta a punta vía el modal de
 * automatización del indicador — la prueba de ejecución real contra un
 * servidor HTTP real está cubierta en tests/integration/aplicacion.test.ts).
 */

let aplicacion: ElectronApplication;
let pagina: Page;
let dataDir: string;

test.beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-e2e-iter3-'));
  aplicacion = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, KPITRACKER_DATA_DIR: dataDir, ELECTRON_DISABLE_SANDBOX: '1' }
  });
  pagina = await aplicacion.firstWindow();
  await pagina.setViewportSize({ width: 1440, height: 900 });
  await pagina.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  await aplicacion.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test.describe.configure({ mode: 'serial' });

test('crear un indicador, capturar un resultado y verlo en la pestaña Histórico de Seguimiento', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Cumplimiento de plazos');
  await pagina.getByTestId('indicador-definicion').fill('Porcentaje de casos resueltos dentro del plazo legal.');
  await pagina.getByTestId('indicador-meta').fill('90');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Cumplimiento de plazos')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Cumplimiento de plazos' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');
  await pagina.getByTestId('celda-GENERAL').fill('82.5');
  await pagina.getByTestId('celda-GENERAL').press('Enter');
  await pagina.waitForTimeout(1500);

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await expect(pagina.getByTestId('tabla-historico')).toBeVisible();
  const fila = pagina.getByTestId('historico-Cumplimiento de plazos');
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('82.5');
});

test('marcar un atributo como filtrable lo expone como filtro dinámico en Seguimiento', async () => {
  await pagina.getByTestId('nav-atributos').click();
  await pagina.getByTestId('nuevo-atributo').click();
  await pagina.getByTestId('atributo-nombre').fill('Prioridad');
  await pagina.getByLabel('Usar como filtro en Seguimiento').check();
  await pagina.getByTestId('guardar-atributo').click();

  await pagina.getByTestId('nav-seguimiento').click();
  await expect(pagina.getByTestId('filtro-atributo-Prioridad')).toBeVisible();
});

test('probar la conexión de un origen automático informa el resultado', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-origen').click();
  await pagina.getByTestId('origen-nombre').fill('API institucional');
  await pagina.getByTestId('origen-campo-url').fill('http://127.0.0.1:9/no-existe');
  await pagina.getByTestId('origen-probar').click();
  await expect(pagina.getByTestId('origen-resultado-prueba')).toBeVisible();
  await pagina.getByTestId('guardar-origen').click();
  await expect(pagina.getByTestId('origen-API institucional')).toBeVisible();
});

test('probar código de un origen automático ejecuta el script y muestra el resultado o el error', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('origen-API institucional').click();
  await expect(pagina.getByTestId('origen-probar-codigo')).toBeDisabled();
  await pagina.getByTestId('origen-script-prueba').fill('/no-existe');
  await expect(pagina.getByTestId('origen-probar-codigo')).toBeEnabled();
  await pagina.getByTestId('origen-probar-codigo').click();
  // El origen apunta a un puerto sin servidor: falla de forma determinística, sin depender de la red real.
  await expect(pagina.getByTestId('origen-resultado-codigo')).toBeVisible();
  await pagina.getByLabel('Cerrar panel').click();
});

test('un origen XMLA puede configurarse con inicio de sesión interactivo de Microsoft', async () => {
  // No se hace click en "Probar conexión": abriría una ventana real de login de
  // Microsoft que nunca se completaría en este entorno. La cobertura del
  // intercambio/renovación de token real vive en
  // tests/integration/AutenticadorMicrosoft.test.ts; esta prueba solo verifica
  // que la UI ofrece el modo y persiste su configuración correctamente.
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-origen').click();
  await pagina.getByTestId('origen-nombre').fill('SSAS corporativo');
  await pagina.getByTestId('origen-tipo').selectOption('XMLA');
  await pagina.getByTestId('origen-xmla-autenticacion').selectOption('microsoft');
  await pagina.getByTestId('origen-campo-tenantId').fill('mi-tenant.onmicrosoft.com');
  await pagina.getByTestId('origen-campo-clienteId').fill('11111111-2222-3333-4444-555555555555');
  await pagina.getByTestId('guardar-origen').click();
  await expect(pagina.getByTestId('origen-SSAS corporativo')).toBeVisible();

  await pagina.getByTestId('origen-SSAS corporativo').click();
  await expect(pagina.getByTestId('origen-xmla-autenticacion')).toHaveValue('microsoft');
  await expect(pagina.getByTestId('origen-campo-tenantId')).toHaveValue('mi-tenant.onmicrosoft.com');
  await pagina.getByLabel('Cerrar panel').click();
});

test('configurar la obtención automática de un indicador desde el modal habilita el botón en Recolección', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('indicador-Cumplimiento de plazos').click();
  await pagina.getByTestId('abrir-automatizacion').click();
  await pagina.getByTestId('automatizacion-origen').selectOption({ label: 'API institucional (API)' });
  await pagina.getByTestId('automatizacion-script').fill('/resultados?indicador={anio}');
  await pagina.getByTestId('automatizacion-guardar').click();
  await expect(pagina.getByText('Configuración guardada.')).toBeVisible();
  await pagina.getByTestId('automatizacion-cerrar').click();
  await pagina.getByTestId('cancelar-indicador').click();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Cumplimiento de plazos' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await expect(pagina.getByTestId('recoleccion-obtener-automatico')).toBeVisible();
  await pagina.getByTestId('recoleccion-obtener-automatico').click();
  // No se configuró la columna del valor: falla de forma determinística, sin depender de la red.
  await expect(pagina.getByTestId('aviso-obtener-automatico')).toContainText('columna del valor');
});
