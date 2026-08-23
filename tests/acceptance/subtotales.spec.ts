import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { iniciarAppWeb } from './fixtures';

/**
 * Prueba de aceptación del cubo de subtotales (cada indicador con N
 * desagregaciones activas genera General + un subtotal por cada
 * subconjunto de desagregaciones presentes + el detalle completo — no solo
 * General + detalle completo) y del "segmentador de subtotal" en el mapeo
 * de columnas de un origen automático (una columna booleana que indica,
 * fila por fila, si una desagregación viene enrollada/subtotal en esa
 * fila — como `ROLLUPADDISSUBTOTAL` en DAX `SUMMARIZECOLUMNS`).
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;
let servidor: Server;
let puerto: number;

test.beforeAll(async () => {
  // Servidor HTTP local real que emula un origen con filas ya pre-agregadas por
  // ROLLUPADDISSUBTOTAL: una fila de subtotal de Sexo=Masculino (con "esSubtotalProvincia"
  // en verdadero, aunque el valor de "provincia" no venga en blanco) y dos de detalle completo.
  servidor = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([
      { sexo: 'Masculino', provincia: 'TODAS', esSubtotalProvincia: 'true', total: '300' },
      { sexo: 'Masculino', provincia: 'Santo Domingo', esSubtotalProvincia: 'false', total: '180' },
      { sexo: 'Masculino', provincia: 'Santiago', esSubtotalProvincia: 'false', total: '120' }
    ]));
  });
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
  const direccion = servidor.address();
  puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

  const app = await iniciarAppWeb('subtotales');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});

test.describe.configure({ mode: 'serial' });

test('un indicador con 2 desagregaciones muestra General + subtotales + detalle completo en Recolección', async () => {
  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('nueva-lista').click();
  await pagina.getByTestId('lista-nombre').fill('Sexo cubo E2E');
  await pagina.getByTestId('lista-prefijo').fill('SXE');
  await pagina.getByTestId('guardar-lista').click();
  await pagina.getByTestId('lista-Sexo cubo E2E').click();
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-nombre-1').fill('Masculino');
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-nombre-2').fill('Femenino');

  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('nueva-lista').click();
  await pagina.getByTestId('lista-nombre').fill('Provincia cubo E2E');
  await pagina.getByTestId('lista-prefijo').fill('PVE');
  await pagina.getByTestId('guardar-lista').click();
  await pagina.getByTestId('lista-Provincia cubo E2E').click();
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-nombre-1').fill('Santo Domingo');
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-nombre-2').fill('Santiago');

  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador cubo E2E');
  await pagina.getByTestId('indicador-definicion').fill('Prueba del cubo de subtotales.');
  await pagina.getByTestId('desagregacion-Sexo cubo E2E').check();
  await pagina.getByTestId('desagregacion-Provincia cubo E2E').check();
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador cubo E2E')).toBeVisible();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador cubo E2E' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  // (2+1) × (2+1) = 9: General + 2 subtotales de Sexo + 2 de Provincia + 4 de detalle completo.
  const filas = pagina.locator('[data-testid="grilla-captura"] tbody tr');
  await expect(filas).toHaveCount(9);
  // Al menos una fila de subtotal (nivel intermedio) debe mostrar "Todos" en la
  // desagregación enrollada de esa combinación.
  await expect(pagina.locator('[data-testid="grilla-captura"] tbody tr.fila-subtotal').first()).toBeVisible();
  await expect(pagina.locator('[data-testid="grilla-captura"] td.celda-enrollada').first()).toHaveText('Todos');
});

test('el mapeo de columnas ofrece "segmentador de subtotal" para una desagregación ya mapeada, y el origen escribe subtotales vía el segmentador', async () => {
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-origen').click();
  await pagina.getByTestId('origen-nombre').fill('API cubo E2E');
  await pagina.getByTestId('origen-campo-url').fill(`http://127.0.0.1:${puerto}`);
  await pagina.getByTestId('origen-campo-metodo').fill('GET');
  await pagina.getByTestId('guardar-origen').click();
  await expect(pagina.getByTestId('origen-API cubo E2E')).toBeVisible();

  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('indicador-Indicador cubo E2E').click();
  await pagina.getByTestId('abrir-automatizacion').click();
  await pagina.getByTestId('automatizacion-origen').selectOption({ label: 'API cubo E2E (API)' });
  await pagina.getByTestId('automatizacion-script').fill('/resultados');
  await pagina.getByTestId('automatizacion-ejecutar').click();
  await expect(pagina.getByTestId('automatizacion-mapeo-sexo')).toBeVisible();

  await pagina.getByTestId('automatizacion-mapeo-total').selectOption({ label: 'Es el valor del resultado' });
  await pagina.getByTestId('automatizacion-mapeo-sexo').selectOption({ label: 'Sexo cubo E2E' });
  await pagina.getByTestId('automatizacion-mapeo-provincia').selectOption({ label: 'Provincia cubo E2E' });
  // Una vez que "Provincia cubo E2E" tiene columna de valor, su segmentador queda disponible en otra columna.
  await expect(pagina.getByTestId('automatizacion-mapeo-esSubtotalProvincia').locator('option', { hasText: 'Segmentador de subtotal de Provincia cubo E2E' })).toHaveCount(1);
  await pagina.getByTestId('automatizacion-mapeo-esSubtotalProvincia').selectOption({ label: 'Segmentador de subtotal de Provincia cubo E2E' });

  await pagina.getByTestId('automatizacion-guardar').click();
  await expect(pagina.getByText('Configuración guardada.')).toBeVisible();
  await pagina.getByTestId('automatizacion-cerrar').click();
  await pagina.getByTestId('cancelar-indicador').click();

  await pagina.getByTestId('nav-recoleccion').click();
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  // El indicador ya venía seleccionado en el store desde la primera prueba de este archivo
  // (persiste entre navegaciones): el montaje dispara `refrescar()`, que puede seguir en
  // vuelo cuando esta línea ya "reselecciona" el mismo valor. Se espera a que asiente antes
  // de tocar la fecha de corte, para no correr contra esa respuesta tardía.
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador cubo E2E' });
  await pagina.waitForTimeout(500);
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');
  await expect(pagina.getByTestId('celda-GENERAL')).toBeEnabled();
  await pagina.getByTestId('recoleccion-obtener-automatico').click();
  await expect(pagina.getByTestId('aviso-obtener-automatico')).toContainText('3 celda');

  // La fila "TODAS"/segmentador=true escribió el subtotal de Sexo=Masculino (Provincia
  // enrollada) — no un detalle con provincia literalmente "TODAS".
  const filaSubtotalMasculino = pagina.locator('[data-testid="grilla-captura"] tbody tr').filter({ hasText: 'Masculino' }).filter({ hasText: 'Todos' });
  await expect(filaSubtotalMasculino).toHaveCount(1);
});
