import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch X — X4: clic en un encabezado de columna, tanto en Estado como en
 * Histórico (vista Lista), ordena mayor→menor, menor→mayor, o vuelve al
 * orden por defecto — un ciclo de 3 clics. `indicadores:listar()` ya
 * devuelve las filas ordenadas por nombre (ver `IndicadorRepositoryKnex`),
 * así que para distinguir de verdad "orden por defecto" de "ascendente" se
 * ordena por una columna DISTINTA de nombre, cuyo valor no coincide con el
 * alfabético por nombre.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('orden-seguimiento');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

async function crearIndicador(nombre: string, periodicidad: string, lineaBase: string): Promise<void> {
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill(nombre);
  await pagina.getByTestId('indicador-definicion').fill('Para probar el orden por encabezado.');
  await pagina.getByTestId('indicador-periodicidad').selectOption(periodicidad);
  await pagina.getByTestId('indicador-linea-base').fill(lineaBase);
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId(`indicador-${nombre}`)).toBeVisible();
}

test('preparación: tres indicadores — nombre alfabético (Alfa, Mu, Zeta) con periodicidad y línea base en OTRO orden', async () => {
  // Nombre alfabético: Alfa, Mu, Zeta (orden por defecto de indicadores:listar).
  // Periodicidad:      Trimestral, Anual, Mensual  → asc alfabético = Mu(Anual), Zeta(Mensual), Alfa(Trimestral).
  // Línea base:        30, 10, 20                  → asc numérico  = Mu(10), Zeta(20), Alfa(30).
  await crearIndicador('Alfa', 'Trimestral', '30');
  await crearIndicador('Mu', 'Anual', '10');
  await crearIndicador('Zeta', 'Mensual', '20');
});

test('Estado > Lista: clic en "Periodicidad" ordena asc, otro clic desc, un tercero vuelve al orden por defecto (por nombre)', async () => {
  await pagina.getByTestId('nav-seguimiento').click();
  await expect(pagina.getByTestId('tabla-seguimiento')).toBeVisible();

  const nombresFilas = () => pagina.getByTestId('tabla-seguimiento').locator('tbody tr td:nth-child(2) strong').allTextContents();

  // Orden por defecto: alfabético por nombre.
  await expect.poll(nombresFilas).toEqual(['Alfa', 'Mu', 'Zeta']);

  await pagina.getByTestId('orden-periodicidad').click();
  await expect.poll(nombresFilas).toEqual(['Mu', 'Zeta', 'Alfa']);

  await pagina.getByTestId('orden-periodicidad').click();
  await expect.poll(nombresFilas).toEqual(['Alfa', 'Zeta', 'Mu']);

  await pagina.getByTestId('orden-periodicidad').click();
  await expect.poll(nombresFilas).toEqual(['Alfa', 'Mu', 'Zeta']);
});

test('Histórico > Lista: el mismo ciclo aplica a "Línea base", una columna numérica', async () => {
  await pagina.getByTestId('pestana-historico').click();
  await expect(pagina.getByTestId('tabla-historico')).toBeVisible();

  const nombresFilas = () => pagina.getByTestId('tabla-historico').locator('tbody tr td:first-child strong').allTextContents();

  await expect.poll(nombresFilas).toEqual(['Alfa', 'Mu', 'Zeta']);

  await pagina.getByTestId('orden-lineaBase').click();
  await expect.poll(nombresFilas).toEqual(['Mu', 'Zeta', 'Alfa']);

  await pagina.getByTestId('orden-lineaBase').click();
  await expect.poll(nombresFilas).toEqual(['Alfa', 'Zeta', 'Mu']);

  await pagina.getByTestId('orden-lineaBase').click();
  await expect.poll(nombresFilas).toEqual(['Alfa', 'Mu', 'Zeta']);
});
