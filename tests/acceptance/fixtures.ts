import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { crearApp } from '../../src/server/app';

export interface ServidorWebE2E {
  pagina: Page;
  baseUrl: string;
  cerrar(): Promise<void>;
}

export const ADMIN_USUARIO = 'admin';
export const ADMIN_PASSWORD = 'admin12345';

/**
 * Levanta un servidor Express real (con la SPA de `npm run build`
 * servida estática — construida una sola vez en `globalSetup`, ver
 * `playwright.config.ts`) sobre un `dataDir` temporal aislado por archivo
 * de spec, y abre un navegador real apuntando a él — reemplaza
 * `electron.launch()` + `firstWindow()` (ver plan Fase 4 §9.9). Mismo
 * aislamiento de datos que antes daba `KPITRACKER_DATA_DIR`, ahora pasado
 * directo a `crearApp`. NO inicia sesión — para eso ver `iniciarAppWeb`,
 * que envuelve esto y hace login real contra la UI; `abrirServidorWeb` a
 * secas es lo que necesita `login.spec.ts` para probar el propio flujo de
 * autenticación (credenciales incorrectas, redirect sin sesión, etc.).
 */
export async function abrirServidorWeb(prefijoDatos: string): Promise<ServidorWebE2E> {
  const dataDir = mkdtempSync(join(tmpdir(), `kpitracker-e2e-${prefijoDatos}-`));
  process.env.ADMIN_INICIAL_USUARIO = ADMIN_USUARIO;
  process.env.ADMIN_INICIAL_PASSWORD = ADMIN_PASSWORD;

  const { app, cerrar: cerrarAplicacion } = await crearApp({ dataDir });
  const servidor: Server = createServer(app);
  await new Promise<void>((resolve) => servidor.listen(0, () => resolve()));
  const direccion = servidor.address();
  const puerto = direccion && typeof direccion === 'object' ? direccion.port : 0;
  const baseUrl = `http://127.0.0.1:${puerto}`;

  // executablePath explícito: el binario que trae este entorno no siempre coincide
  // con el que @playwright/test intentaría descargar para esta versión exacta.
  const navegador: Browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pagina = await navegador.newPage();

  return {
    pagina,
    baseUrl,
    async cerrar() {
      await navegador.close();
      await new Promise<void>((resolve) => servidor.close(() => resolve()));
      await cerrarAplicacion();
      rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

export interface AppWebE2E {
  pagina: Page;
  cerrar(): Promise<void>;
}

/** Como `abrirServidorWeb`, pero además inicia sesión de verdad contra la UI como el administrador auto-sembrado. */
export async function iniciarAppWeb(prefijoDatos: string): Promise<AppWebE2E> {
  const { pagina, baseUrl, cerrar } = await abrirServidorWeb(prefijoDatos);
  await pagina.goto(baseUrl);
  await pagina.getByTestId('login-usuario').fill(ADMIN_USUARIO);
  await pagina.getByTestId('login-password').fill(ADMIN_PASSWORD);
  await pagina.getByTestId('login-enviar').click();
  await pagina.getByTestId('pagina-seguimiento').waitFor();

  return { pagina, cerrar };
}
