import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { iniciarAppWeb } from './fixtures';

/**
 * Batch AC (pedido explícito del usuario): las filas de grupo (Equipo /
 * Categoría / Subcategoría) en Seguimiento > Histórico ganan un SUBTOTAL —
 * un valor agregado por cada columna de período, no solo el conteo entre
 * paréntesis que ya existía (U4/U5a). Es lo mismo que ya pedía Y7 ("Medición
 * por categoría"), reutilizado acá: la regla configurada de la categoría, o
 * promedio simple si no hay una (un equipo nunca tiene configuración
 * propia). Solo entran los indicadores DIRECTOS del nodo — mismo contrato
 * no-recursivo que ya documenta `ServicioMedicionCategoria`.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;

test.beforeAll(async () => {
  const app = await iniciarAppWeb('batch-ac');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
});

test.describe.configure({ mode: 'serial' });

test('AC1: la fila de una categoría en Histórico > Árbol (Categoría) muestra el promedio de sus indicadores directos, por columna', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nueva-categoria').click();
  await pagina.getByTestId('categoria-nombre').fill('Subtotal AC');
  await pagina.getByTestId('guardar-categoria').click();
  await expect(pagina.getByTestId('categoria-Subtotal AC')).toBeVisible();

  const anio = new Date().getFullYear();

  // Dos indicadores mensuales, ambos en "Subtotal AC" — sin config de medición propia (default: promedio).
  for (const [nombre, valor] of [['Indicador AC Uno', '60'], ['Indicador AC Dos', '80']] as const) {
    await pagina.getByTestId('nav-indicadores').click();
    await pagina.getByTestId('nuevo-indicador').click();
    await pagina.getByTestId('indicador-nombre').fill(nombre);
    await pagina.getByTestId('indicador-definicion').fill('Para probar el subtotal por categoría en Histórico.');
    await pagina.getByTestId('indicador-periodicidad').selectOption('Mensual');
    await pagina.getByTestId('indicador-categoria').click();
    await pagina.getByTestId('indicador-categoria').fill('Subtotal AC');
    await pagina.getByTestId('indicador-categoria-opcion-Subtotal AC').click();
    // Meta global 100 — el subtotal agrega sobre el % de cumplimiento (valor/meta*100), no el
    // valor crudo, así que sin una meta resoluble el resultado capturado no produciría ningún %.
    await pagina.getByTestId('indicador-meta').fill('100');
    await pagina.getByTestId('guardar-indicador').click();
    await expect(pagina.getByTestId(`indicador-${nombre}`)).toBeVisible();

    await pagina.getByTestId('nav-recoleccion').click();
    await pagina.getByTestId('recoleccion-indicador').selectOption({ label: nombre });
    await pagina.getByTestId('recoleccion-periodo').selectOption({ label: `Enero ${anio}` });
    await pagina.getByTestId('recoleccion-fecha-corte').fill(`${anio}-01-31`);
    await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
    await pagina.getByTestId('celda-GENERAL').fill(valor);
    await pagina.getByTestId('celda-GENERAL').press('Enter');
    await pagina.waitForTimeout(1500);
  }

  await pagina.getByTestId('nav-seguimiento').click();
  await pagina.getByTestId('pestana-historico').click();
  await pagina.getByTestId('vista-historico-arbol').click();
  await expect(pagina.getByTestId('tabla-historico-arbol')).toBeVisible();
  await expect(pagina.getByTestId('historico-arbol-categoria-Subtotal AC')).toBeVisible();

  // Meta 100 en ambos: % de cumplimiento 60% y 80% — (60 + 80) / 2 = 70, promedio simple,
  // sin config de medición para "Subtotal AC" (la operación matemática opera sobre el %, no el valor crudo).
  const periodoId = `${anio}-Mensual-01`;
  await expect(pagina.getByTestId(`subtotal-Subtotal AC-${periodoId}`)).toHaveText('70');
});
