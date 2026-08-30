import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch BB (pedido explícito del usuario): el subtotal de una columna de
 * CORTE para una fila de grupo (Categoría/Subcategoría) deja de ser
 * recursivo (subtotal-de-subtotales, igual que las columnas de período
 * mensual) — pasa a aplanar TODO el subárbol a sus indicadores hoja y
 * agregarlos en un solo paso "al nivel de la fila en la que está", con la
 * regla/acotamiento de ESA fila. Prueba explícita del ANTES/DESPUÉS con
 * números elegidos para que ambos métodos den resultados DISTINTOS.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('corte-no-recursivo');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

const anio = new Date().getFullYear();
const periodoIdCorte = `${anio}-Trimestral-01`;

async function crearIndicadorEnCategoria(nombre: string, categoria: string, meta: string, valor: string): Promise<void> {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill(nombre);
  await pagina.getByTestId('indicador-definicion').fill('Batch BB — subtotal de corte no recursivo.');
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

test('preparación: corte Trimestral + categoría "BB Padre" (1 indicador directo) con subcategoría "BB Hija" (2 indicadores)', async () => {
  await pagina.getByTestId('nav-cortes-medicion').click();
  await expect(pagina.getByTestId('tabla-cortes-medicion')).toBeVisible();
  await pagina.getByTestId('nuevo-corte-medicion').click();
  await pagina.getByTestId('corte-nombre').fill('Corte BB');
  await pagina.getByTestId('corte-periodicidad').selectOption('Trimestral');
  await pagina.getByTestId('guardar-corte-medicion').click();
  await expect(pagina.getByTestId('corte-medicion-Corte BB')).toBeVisible();

  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nueva-categoria').click();
  await pagina.getByTestId('categoria-nombre').fill('BB Padre');
  await pagina.getByTestId('guardar-categoria').click();
  await expect(pagina.getByTestId('categoria-BB Padre')).toBeVisible();

  await pagina.getByTestId('nueva-categoria').click();
  await pagina.getByTestId('categoria-nombre').fill('BB Hija');
  await pagina.getByTestId('categoria-padre').selectOption({ label: 'BB Padre' });
  await pagina.getByTestId('guardar-categoria').click();
  await expect(pagina.getByTestId('categoria-BB Hija')).toBeVisible();

  // Meta 100 en los tres, % de cumplimiento = valor crudo. BB Padre directo: 90%.
  // BB Hija: 90% y 10% (promedio simple de la hija = 50%, coincide en ambos métodos).
  await crearIndicadorEnCategoria('BB Padre Directo', 'BB Padre', '100', '90');
  await crearIndicadorEnCategoria('BB Hija Uno', 'BB Hija', '100', '90');
  await crearIndicadorEnCategoria('BB Hija Dos', 'BB Hija', '100', '10');
});

test('BB1: el Subtotal de corte de "BB Hija" (sin hijos propios) es 50% — el mismo bajo ambos métodos', async () => {
  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await pagina.getByTestId('vista-historico-arbol').click();
  await expect(pagina.getByTestId('tabla-historico-arbol')).toBeVisible();

  await pagina.getByTestId('historico-filtro-cortes').click();
  await pagina.getByTestId('historico-filtro-cortes-opcion-Corte BB (Trimestral)').click();
  await pagina.getByTestId('historico-filtro-cortes').click(); // cierra el panel

  // (90 + 10) / 2 = 50%.
  await expect(pagina.getByTestId(`subtotal-BB Hija-${periodoIdCorte}`)).toHaveText('50%');
});

test('BB2: el Subtotal de corte de "BB Padre" aplana el subárbol (63.33%), NO el subtotal-de-subtotales recursivo (que daría 70%)', async () => {
  // Recursivo (comportamiento ANTERIOR, incorrecto): entradas = [directo 90%, subtotal YA
  // AGREGADO de la hija 50%] → (90+50)/2 = 70%.
  // Fila-nivel (comportamiento NUEVO, pedido explícito del usuario): entradas = TODOS los
  // indicadores del subárbol, aplanados = [90, 90, 10] → (90+90+10)/3 = 63.33%.
  await expect(pagina.getByTestId(`subtotal-BB Padre-${periodoIdCorte}`)).toHaveText('63.33%');

  // Las columnas de PERÍODO (mensuales) siguen siendo recursivas — sin cambios (Batch AI):
  // Padre = (90 directo + 50 subtotal de la hija) / 2 = 70%, distinto del subtotal de corte.
  const periodoIdMensual = `${anio}-Mensual-01`;
  await expect(pagina.getByTestId(`subtotal-BB Padre-${periodoIdMensual}`)).toHaveText('70%');
});

test('BB3: el toggle "Acotar cada resultado participante al 100%" existe en Categorías y Equipos, encendido por defecto', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('categoria-BB Padre').click();
  await expect(pagina.getByTestId('categoria-medicion-acotar-100')).toBeChecked();
  await pagina.locator('.telon').click(); // cierra el panel — evita que bloquee el clic siguiente

  await pagina.getByTestId('nuevo-equipo').click();
  await pagina.getByTestId('equipo-nombre').fill('BB Equipo');
  await pagina.getByTestId('guardar-equipo').click();
  await expect(pagina.getByTestId('equipo-BB Equipo')).toBeVisible();
  await pagina.getByTestId('equipo-BB Equipo').click();
  await expect(pagina.getByTestId('equipo-medicion-acotar-100')).toBeChecked();
});
