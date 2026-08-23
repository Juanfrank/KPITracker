import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { iniciarAppWeb } from './fixtures';

/**
 * Prueba de aceptación del generador de consultas DAX: en vez de escribir
 * `SUMMARIZECOLUMNS` a mano, el usuario solo ingresa el nombre de la medida —
 * la consulta se arma a partir del alias por origen (Tabla[Columna]) de cada
 * desagregación y de la tabla/columna de fecha del origen PowerBI, ambos
 * configurados una sola vez.
 */

let pagina: Page;
let cerrarApp: () => Promise<void>;
let servidor: Server;
let puerto: number;

test.beforeAll(async () => {
  // Servidor HTTP local real que emula un origen PowerBI (token OAuth2 + "Execute Queries").
  servidor = createServer((req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/token') {
      res.end(JSON.stringify({ access_token: 'token-e2e-dax', expires_in: 3600 }));
      return;
    }
    if (req.url === '/v1.0/myorg/datasets/ds-e2e/executeQueries') {
      res.end(JSON.stringify({
        results: [{
          tables: [{
            rows: [
              { 'Sexo[Nombre]': '', 'Provincia[Nombre]': '', '[EsSubtotal1]': true, '[EsSubtotal2]': true, '[Total]': 400 },
              { 'Sexo[Nombre]': 'Masculino', 'Provincia[Nombre]': '', '[EsSubtotal1]': false, '[EsSubtotal2]': true, '[Total]': 250 },
              { 'Sexo[Nombre]': 'Masculino', 'Provincia[Nombre]': 'Santo Domingo', '[EsSubtotal1]': false, '[EsSubtotal2]': false, '[Total]': 150 }
            ]
          }]
        }]
      }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: { message: 'No encontrado' } }));
  });
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
  const direccion = servidor.address();
  puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

  const app = await iniciarAppWeb('dax');
  pagina = app.pagina;
  cerrarApp = app.cerrar;
});

test.afterAll(async () => {
  await cerrarApp();
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});

test.describe.configure({ mode: 'serial' });

test('genera la consulta DAX a partir del nombre de la medida y captura el cubo obtenido automáticamente', async () => {
  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('nueva-lista').click();
  await pagina.getByTestId('lista-nombre').fill('Sexo DAX E2E');
  await pagina.getByTestId('lista-prefijo').fill('SXD');
  await pagina.getByTestId('guardar-lista').click();
  await pagina.getByTestId('lista-Sexo DAX E2E').click();
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-nombre-1').fill('Masculino');

  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('nueva-lista').click();
  await pagina.getByTestId('lista-nombre').fill('Provincia DAX E2E');
  await pagina.getByTestId('lista-prefijo').fill('PVD');
  await pagina.getByTestId('guardar-lista').click();
  await pagina.getByTestId('lista-Provincia DAX E2E').click();
  await pagina.getByTestId('agregar-elemento').click();
  await pagina.getByTestId('elemento-nombre-1').fill('Santo Domingo');

  // Origen PowerBI: tabla/columna de fecha configuradas una sola vez.
  await pagina.getByTestId('nav-admin').click();
  await pagina.getByTestId('nuevo-origen').click();
  await pagina.getByTestId('origen-nombre').fill('PowerBI DAX E2E');
  await pagina.getByTestId('origen-tipo').selectOption('PowerBI');
  await pagina.getByTestId('origen-campo-datasetId').fill('ds-e2e');
  await pagina.getByTestId('origen-campo-apiBase').fill(`http://127.0.0.1:${puerto}/v1.0/myorg`);
  await pagina.getByTestId('origen-campo-daxTablaFecha').fill('Fecha');
  await pagina.getByTestId('origen-campo-daxColumnaFecha').fill('Fecha');
  await pagina.getByTestId('origen-powerbi-autenticacion').selectOption('oauth2');
  await pagina.getByTestId('origen-campo-tokenUrl').fill(`http://127.0.0.1:${puerto}/token`);
  await pagina.getByTestId('origen-campo-clienteId').fill('cid-e2e');
  await pagina.getByTestId('origen-campo-clienteSecreto').fill('secreto-e2e');
  await pagina.getByTestId('guardar-origen').click();
  await expect(pagina.getByTestId('origen-PowerBI DAX E2E')).toBeVisible();

  // Alias por origen (Tabla[Columna]) — una sola vez por lista×origen.
  await pagina.getByTestId('nav-listas').click();
  await pagina.getByTestId('lista-Sexo DAX E2E').click();
  await pagina.getByText('Editar lista').click();
  await pagina.getByTestId('lista-alias-PowerBI DAX E2E').fill('Sexo[Nombre]');
  await pagina.getByLabel('Cerrar panel').click();
  await pagina.getByTestId('lista-Provincia DAX E2E').click();
  await pagina.getByText('Editar lista').click();
  await pagina.getByTestId('lista-alias-PowerBI DAX E2E').fill('Provincia[Nombre]');
  await pagina.getByLabel('Cerrar panel').click();

  // Indicador con ambas desagregaciones.
  await pagina.getByTestId('nav-indicadores').click();
  await pagina.getByTestId('nuevo-indicador').click();
  await pagina.getByTestId('indicador-nombre').fill('Indicador DAX E2E');
  await pagina.getByTestId('indicador-definicion').fill('Prueba del generador de consultas DAX.');
  await pagina.getByTestId('desagregacion-Sexo DAX E2E').check();
  await pagina.getByTestId('desagregacion-Provincia DAX E2E').check();
  await pagina.getByTestId('guardar-indicador').click();
  await expect(pagina.getByTestId('indicador-Indicador DAX E2E')).toBeVisible();

  await pagina.getByTestId('indicador-Indicador DAX E2E').click();
  await pagina.getByTestId('abrir-automatizacion').click();
  await pagina.getByTestId('automatizacion-origen').selectOption({ label: 'PowerBI DAX E2E (PowerBI)' });

  await pagina.getByTestId('automatizacion-medida-dax').fill('Total de casos');
  await pagina.getByTestId('automatizacion-generar-dax').click();
  await expect(pagina.getByText('Consulta DAX generada. Ejecútela (paso 3) para validar los valores.')).toBeVisible();
  await expect(pagina.getByTestId('automatizacion-script')).toHaveValue(/ROLLUPADDISSUBTOTAL/);
  await expect(pagina.getByTestId('automatizacion-script')).toHaveValue(/"Total", \[Total de casos\]/);

  await pagina.getByTestId('automatizacion-ejecutar').click();
  // El mapeo de columnas ya viene resuelto por el generador (no "— ignorar —").
  await expect(pagina.getByTestId('automatizacion-mapeo-Sexo[Nombre]')).toBeVisible();
  await expect(pagina.getByTestId('automatizacion-mapeo-[Total]')).toHaveValue('__valor__');

  await pagina.getByTestId('automatizacion-guardar').click();
  await expect(pagina.getByText('Configuración guardada.')).toBeVisible();
  await pagina.getByTestId('automatizacion-cerrar').click();
  await pagina.getByTestId('cancelar-indicador').click();

  await pagina.getByTestId('nav-recoleccion').click();
  await pagina.getByTestId('recoleccion-indicador').selectOption({ label: 'Indicador DAX E2E' });
  await expect(pagina.getByTestId('grilla-captura')).toBeVisible();
  await pagina.waitForTimeout(500);
  await pagina.getByTestId('recoleccion-fecha-corte').fill('2026-06-30');
  await expect(pagina.getByTestId('celda-GENERAL')).toBeEnabled();
  await pagina.getByTestId('recoleccion-obtener-automatico').click();
  await expect(pagina.getByTestId('aviso-obtener-automatico')).toContainText('3 celda');
});
