import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Seguimiento → Histórico debe mostrar la Meta configurada (no global) que
 * esté vigente para cada período específico, cuando exista una — en vez de
 * solo el escalar `Indicador.metaGlobal` (que además sigue usándose como
 * respaldo de compatibilidad cuando NO hay una Meta configurada para ese
 * período/año, ver `metaVigenteParaPeriodo`).
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('meta-periodo');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('preparación: indicador con meta global, un resultado capturado, y una Meta específica para ese año/periodicidad', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Tasa de vacunación anual');
  await pagina.getByTestId('indicador-definicion').fill('Porcentaje de la población vacunada en el mes.');
  await pagina.getByTestId('indicador-meta').fill('90');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Tasa de vacunación anual')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Tasa de vacunación anual' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');
  await pagina.getByTestId('celda-GENERAL').fill('82.5');
  await pagina.getByTestId('celda-GENERAL').press('Enter');
  await pagina.waitForTimeout(1500);

  // Meta específica (95, distinta de la global 90) para el mismo año/periodicidad
  // que cubre el período recién capturado (Junio 2026, Mensual).
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('indicador-Tasa de vacunación anual').click();
  await pagina.getByTestId('agregar-meta').click();
  await pagina.getByTestId('meta-valor-0').fill('95');
  await pagina.getByTestId('meta-anio-0').fill('2026');
  await expect(pagina.getByTestId('meta-periodicidad-0')).toHaveValue('Mensual');
  await pagina.waitForTimeout(700);
  // Cierra el panel del indicador (la Meta ya se guardó por su propio debounce) —
  // dejarlo abierto deja el `.telon` de PanelLateral bloqueando clics en el resto de la app.
  await pagina.getByTestId('cancelar-indicador').click();
});

test('el histórico muestra "Meta: 95" (la Meta configurada del período), no la meta global 90', async () => {
  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await expect(pagina.getByTestId('tabla-historico')).toBeVisible();

  const fila = pagina.getByTestId('historico-Tasa de vacunación anual');
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('82.5');
  await expect(fila).toContainText('Meta: 95');
  await expect(fila).not.toContainText('Meta: 90');
});

test('un indicador sin Meta configurada para el período cae al escalar metaGlobal (compatibilidad): sin línea "Meta: X"', async () => {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Sin meta por período');
  await pagina.getByTestId('indicador-definicion').fill('Indicador sin Meta específica configurada.');
  await pagina.getByTestId('indicador-meta').fill('50');
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Sin meta por período')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Sin meta por período' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');
  await pagina.getByTestId('celda-GENERAL').fill('40');
  await pagina.getByTestId('celda-GENERAL').press('Enter');
  await pagina.waitForTimeout(1500);

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await expect(pagina.getByTestId('tabla-historico')).toBeVisible();

  const fila = pagina.getByTestId('historico-Sin meta por período');
  await expect(fila).toBeVisible();
  await expect(fila).toContainText('40');
  // Sin Meta configurada para el período no hay línea "Meta: X" — pero el
  // cumplimiento (%) igual se calcula por compatibilidad contra metaGlobal (50): 40/50 = 80%.
  await expect(fila).not.toContainText('Meta:');
  await expect(fila).toContainText('80% de meta');
});
