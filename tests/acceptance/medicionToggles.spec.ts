import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch AT (pedido explícito del usuario): proof-testing de los cálculos a
 * nivel categoría/subcategoría/equipo con las configuraciones de "Medición
 * por categoría" (Batch Y) y de Cortes (acotarAl100) encendidas y apagadas —
 * probando explícitamente el ANTES/DESPUÉS de cada toggle sobre el motor
 * recursivo real de Histórico (`subtotalRecursivo`, Batch AI), no solo el
 * caso por defecto que ya cubren AC1/AC2/AC3.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('medicion-toggles');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

const anio = new Date().getFullYear();
const periodoId = `${anio}-Mensual-01`;

async function crearIndicadorEnCategoria(nombre: string, categoria: string, meta: string, valor: string): Promise<void> {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill(nombre);
  await pagina.getByTestId('indicador-definicion').fill('Batch AT — proof-testing de toggles.');
  await pagina.getByTestId('indicador-periodicidad').selectOption('Mensual');
  await pagina.getByTestId('indicador-categoria').click();
  await pagina.getByTestId('indicador-categoria').fill(categoria);
  await pagina.getByTestId(`indicador-categoria-opcion-${categoria}`).click();
  await pagina.getByTestId('indicador-meta').fill(meta);
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId(`indicador-${nombre}`)).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: nombre });
  await pagina.getByTestId('recoleccion-periodo').selectOption({ label: `Enero ${anio}` });
  await pagina.getByTestId('recoleccion-fecha-corte').fill(`${anio}-01-31`);
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.getByTestId('celda-GENERAL').fill(valor);
  await pagina.getByTestId('celda-GENERAL').press('Enter');
  await pagina.waitForTimeout(1200);
}

test('preparación: categoría "AT Padre" con subcategoría "AT Hija", cada una con 2 indicadores', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nueva-categoria').click();
  await pagina.getByTestId('categoria-nombre').fill('AT Padre');
  await pagina.getByTestId('guardar-categoria').click();
  await expect(pagina.getByTestId('categoria-AT Padre')).toBeVisible();

  await pagina.getByTestId('nueva-categoria').click();
  await pagina.getByTestId('categoria-nombre').fill('AT Hija');
  await pagina.getByTestId('categoria-padre').selectOption({ label: 'AT Padre' });
  await pagina.getByTestId('guardar-categoria').click();
  await expect(pagina.getByTestId('categoria-AT Hija')).toBeVisible();

  // Padre directos: 90% y 30% (meta 100, valor 90/30).
  await crearIndicadorEnCategoria('AT Padre Ind A', 'AT Padre', '100', '90');
  await crearIndicadorEnCategoria('AT Padre Ind B', 'AT Padre', '100', '30');
  // Hija: 60% y 100% (meta 100, valor 60/100).
  await crearIndicadorEnCategoria('AT Hija Ind A', 'AT Hija', '100', '60');
  await crearIndicadorEnCategoria('AT Hija Ind B', 'AT Hija', '100', '100');
});

test('AT1 — reglaGeneral: promedio (default) → máximo → de vuelta a promedio, con la propagación esperada al padre', async () => {
  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await pagina.getByTestId('vista-historico-arbol').click();
  await expect(pagina.getByTestId('tabla-historico-arbol')).toBeVisible();

  // Default (sin config guardada, cae a promedio): Hija = (60+100)/2 = 80%.
  // Padre RECURSIVO = (90 + 30 + 80) / 3 = 66.67% — sus 2 directos + el subtotal de Hija como una entrada más.
  await expect(pagina.getByTestId(`subtotal-AT Hija-${periodoId}`)).toHaveText('80%');
  await expect(pagina.getByTestId(`subtotal-AT Padre-${periodoId}`)).toHaveText('66.67%');

  // Toggle ON: Hija pasa a regla "máximo".
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('categoria-AT Hija').click();
  await pagina.getByTestId('categoria-medicion-regla-general').selectOption('maximo');
  await pagina.getByTestId('guardar-categoria').click();

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await pagina.getByTestId('vista-historico-arbol').click();
  await expect(pagina.getByTestId('tabla-historico-arbol')).toBeVisible();

  // Hija = máximo(60,100) = 100%. Padre RECURSIVO = (90+30+100)/3 = 73.33%.
  await expect(pagina.getByTestId(`subtotal-AT Hija-${periodoId}`)).toHaveText('100%');
  await expect(pagina.getByTestId(`subtotal-AT Padre-${periodoId}`)).toHaveText('73.33%');

  // Toggle OFF: Hija vuelve a "promedio" — el resultado debe volver EXACTAMENTE al original.
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('categoria-AT Hija').click();
  await pagina.getByTestId('categoria-medicion-regla-general').selectOption('promedio');
  await pagina.getByTestId('guardar-categoria').click();

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await pagina.getByTestId('vista-historico-arbol').click();
  await expect(pagina.getByTestId(`subtotal-AT Hija-${periodoId}`)).toHaveText('80%');
  await expect(pagina.getByTestId(`subtotal-AT Padre-${periodoId}`)).toHaveText('66.67%');
});

test('AT2 — excluir: quitar "AT Padre Ind B" del cálculo del padre, y volver a incluirlo', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('categoria-AT Padre').click();
  await expect(pagina.getByTestId('categoria-medicion-excluir-AT Padre Ind B')).toBeVisible();
  await pagina.getByTestId('categoria-medicion-excluir-AT Padre Ind B').check();
  await pagina.getByTestId('guardar-categoria').click();

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await pagina.getByTestId('vista-historico-arbol').click();
  await expect(pagina.getByTestId('tabla-historico-arbol')).toBeVisible();
  // Excluido B (30%): quedan A (90%) + Hija (80%) → (90+80)/2 = 85%.
  await expect(pagina.getByTestId(`subtotal-AT Padre-${periodoId}`)).toHaveText('85%');

  // Toggle OFF: se vuelve a incluir — el resultado regresa al original (66.67%).
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('categoria-AT Padre').click();
  await pagina.getByTestId('categoria-medicion-excluir-AT Padre Ind B').uncheck();
  await pagina.getByTestId('guardar-categoria').click();

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await pagina.getByTestId('vista-historico-arbol').click();
  await expect(pagina.getByTestId(`subtotal-AT Padre-${periodoId}`)).toHaveText('66.67%');
});

test('AT3 — peso: promedio ponderado da más influencia a un indicador, y vuelve al promedio simple al desactivarlo', async () => {
  // 'promedioPonderado' solo pesa una entrada si tiene una Meta VIGENTE para el período (ver
  // `pesoEfectivo`/`EntradaAgregable.tieneMeta`) — metaGlobal sola no basta, así que se
  // configura una Meta recurrente explícita para ambos indicadores de "AT Hija" primero.
  for (const nombre of ['AT Hija Ind A', 'AT Hija Ind B']) {
    await pagina.getByTestId('nav-configuracion-metas').click();
    await pagina.getByTestId('configuracion-metas-indicador').selectOption({ label: nombre });
    await pagina.getByTestId('configuracion-metas-anio').selectOption(String(anio));
    const recurrente = pagina.getByTestId('meta-recurrente-GENERAL');
    await recurrente.fill('100');
    await recurrente.blur();
    await pagina.waitForTimeout(700);
  }

  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('categoria-AT Hija').click();
  await pagina.getByTestId('categoria-medicion-regla-general').selectOption('promedioPonderado');
  await pagina.getByTestId('categoria-medicion-peso-AT Hija Ind A').fill('1');
  await pagina.getByTestId('categoria-medicion-peso-AT Hija Ind B').fill('3');
  await pagina.getByTestId('guardar-categoria').click();

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await pagina.getByTestId('vista-historico-arbol').click();
  await expect(pagina.getByTestId('tabla-historico-arbol')).toBeVisible();
  // Ponderado: (60*1 + 100*3) / (1+3) = 360/4 = 90%.
  await expect(pagina.getByTestId(`subtotal-AT Hija-${periodoId}`)).toHaveText('90%');

  // Toggle OFF: peso igual (1 y 1) bajo el mismo promedio ponderado — matemáticamente
  // equivalente al promedio simple original (80%).
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('categoria-AT Hija').click();
  await pagina.getByTestId('categoria-medicion-peso-AT Hija Ind B').fill('1');
  await pagina.getByTestId('guardar-categoria').click();

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await pagina.getByTestId('vista-historico-arbol').click();
  await expect(pagina.getByTestId(`subtotal-AT Hija-${periodoId}`)).toHaveText('80%');
});

test('AT4 — nivel EQUIPO: sin config propia guardada, el subtotal recursivo de un equipo/sub-equipo cae al default (promedio simple), independiente de cualquier configuración de categoría', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-equipo').click();
  await pagina.getByTestId('equipo-nombre').fill('AT Equipo Padre');
  await pagina.getByTestId('guardar-equipo').click();
  await expect(pagina.getByTestId('equipo-AT Equipo Padre')).toBeVisible();

  await pagina.getByTestId('nuevo-equipo').click();
  await pagina.getByTestId('equipo-nombre').fill('AT Equipo Hijo');
  await pagina.getByTestId('equipo-padre').selectOption({ label: 'AT Equipo Padre' });
  await pagina.getByTestId('guardar-equipo').click();
  await expect(pagina.getByTestId('equipo-AT Equipo Hijo')).toBeVisible();

  // Vincula 2 indicadores directo a cada equipo desde el propio panel de Equipos (checklist
  // "Indicadores de este equipo") — evita el selector jerárquico de Responsable en Indicadores,
  // que reutiliza la misma etiqueta "— Todo el equipo —" para cada grupo.
  // `equipo-indicador-check-*` es un checkbox controlado que solo refleja el vínculo tras un
  // round-trip async (`indicadores:reasignarMasivo` + relistar) — `.click()` + esperar
  // `toBeChecked()` (en vez de `.check()`, que exige la marca inmediatamente tras el clic).
  await pagina.getByTestId('equipo-AT Equipo Padre').click();
  await pagina.getByTestId('equipo-indicador-check-AT Padre Ind A').click();
  await expect(pagina.getByTestId('equipo-indicador-check-AT Padre Ind A')).toBeChecked();
  await pagina.getByTestId('equipo-indicador-check-AT Padre Ind B').click();
  await expect(pagina.getByTestId('equipo-indicador-check-AT Padre Ind B')).toBeChecked();
  await pagina.locator('.telon').click();

  await pagina.getByTestId('equipo-AT Equipo Hijo').click();
  await pagina.getByTestId('equipo-indicador-check-AT Hija Ind A').click();
  await expect(pagina.getByTestId('equipo-indicador-check-AT Hija Ind A')).toBeChecked();
  await pagina.getByTestId('equipo-indicador-check-AT Hija Ind B').click();
  await expect(pagina.getByTestId('equipo-indicador-check-AT Hija Ind B')).toBeChecked();
  await pagina.locator('.telon').click();

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await pagina.getByTestId('vista-historico-equipo').click();
  await expect(pagina.getByTestId('tabla-historico-equipo')).toBeVisible();

  // "AT Hija Ind A/B" en el equipo Hijo: aunque la categoría "AT Hija" sigue configurada en
  // promedio ponderado (peso 1/1), el equipo NUNCA lee esa config — su regla es siempre
  // promedio simple: (60+100)/2 = 80%.
  await expect(pagina.getByTestId('subtotal-equipo-AT Equipo Hijo-' + periodoId)).toHaveText('80%');
  // Equipo Padre RECURSIVO: sus 2 directos (90%, 30%) + el subtotal del Equipo Hijo (80%),
  // como una entrada más — (90+30+80)/3 = 66.67%. Independiente del "excluir"/peso que haya
  // quedado configurado en la categoría — el equipo es una dimensión aparte.
  await expect(pagina.getByTestId('subtotal-equipo-AT Equipo Padre-' + periodoId)).toHaveText('66.67%');
});
