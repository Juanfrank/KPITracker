import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../../src/server/trpc/appRouter';
import { crearApp } from '../../src/server/app';
import type { AppConstruida } from '../../src/server/app';

/**
 * Concurrencia (bloqueo optimista) — pedido explícito del usuario: en vez de
 * "última escritura gana" en silencio, `recoleccion.guardarCelda` rechaza
 * con CONFLICT cuando `versionEsperada` (el `actualizadoEn` que el cliente
 * vio la última vez) ya no coincide con el vigente — ver
 * `ConflictoConcurrenciaError` (dominio) y `ServicioRecoleccion.guardarCelda`.
 * Mismo harness que `permisos.test.ts` (cliente tRPC real contra
 * Express+sesión por cookie) — el mecanismo vive en el servicio de
 * aplicación, alcanzable solo a través de una request HTTP real.
 */

let dataDir: string;
let construida: AppConstruida;
let servidor: Server;
let baseUrl: string;

function fetchConCookies(): typeof fetch {
  let cookie: string | null = null;
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    if (cookie) headers.set('cookie', cookie);
    const respuesta = await fetch(input, { ...init, headers });
    const setCookie = respuesta.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0] ?? null;
    return respuesta;
  };
}

function crearCliente(fetchImpl: typeof fetch) {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${baseUrl}/api/trpc`, fetch: fetchImpl })]
  });
}

async function clienteAdmin() {
  const cliente = crearCliente(fetchConCookies());
  await cliente.auth.login.mutate({ nombreUsuario: 'admin', password: 'admin12345' });
  return cliente;
}

interface DatosConflicto {
  capturadoPor: string | null;
  capturadoEn: string;
  valorActual: number | null;
}

async function capturarConflicto(promesa: Promise<unknown>): Promise<{ codigo?: string; conflicto?: DatosConflicto }> {
  try {
    await promesa;
    return {};
  } catch (error) {
    const err = error as TRPCClientError<AppRouter>;
    return { codigo: err.data?.code, conflicto: (err.data as { conflicto?: DatosConflicto } | undefined)?.conflicto };
  }
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-concurrencia-test-'));
  process.env.ADMIN_INICIAL_USUARIO = 'admin';
  process.env.ADMIN_INICIAL_PASSWORD = 'admin12345';

  construida = await crearApp({ dataDir });
  servidor = createServer(construida.app);
  await new Promise<void>((resolve) => servidor.listen(0, () => resolve()));
  const direccion = servidor.address();
  const puerto = direccion && typeof direccion === 'object' ? direccion.port : 0;
  baseUrl = `http://127.0.0.1:${puerto}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
  await construida.cerrar();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.ADMIN_INICIAL_USUARIO;
  delete process.env.ADMIN_INICIAL_PASSWORD;
});

describe('recoleccion.guardarCelda — bloqueo optimista (concurrencia)', () => {
  async function prepararIndicador(admin: Awaited<ReturnType<typeof clienteAdmin>>) {
    const equipoGeneral = (await admin.equipos.listar.query()).find((e) => e.nombre === 'General')!;
    const categoriaGeneral = (await admin.categorias.listar.query()).find((c) => c.nombre === 'General')!;
    const indicador = await admin.indicadores.guardar.mutate({
      indicador: {
        id: '', codigo: 'CONC-1', nombre: 'Indicador de prueba de concurrencia', definicion: 'def', formaCalculo: null,
        periodicidad: 'Mensual', periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null,
        metaGlobal: null, desagregaciones: [], estado: 'Activo', responsable: null, categoria: categoriaGeneral.id,
        equipo: equipoGeneral.id, unidadMedida: null, esCalculado: false, formula: null, creadoEn: '', actualizadoEn: ''
      },
      valores: []
    });
    const [periodo] = await admin.recoleccion.periodos.query({ indicadorId: indicador.id });
    await admin.recoleccion.fechaCorte.mutate({ indicadorId: indicador.id, periodoId: periodo!.id, fechaCorte: '2026-01-31' });
    return { indicadorId: indicador.id, periodoId: periodo!.id };
  }

  it('una escritura sobre una celda que NUNCA se guardó, con versionEsperada=null, se acepta', async () => {
    const admin = await clienteAdmin();
    const { indicadorId, periodoId } = await prepararIndicador(admin);
    const { valor } = await admin.recoleccion.guardarCelda.mutate({
      indicadorId, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10', versionEsperada: null
    });
    expect(valor).toBe(10);
  });

  it('reintentar con la MISMA versión ya superada (stale) se rechaza con CONFLICT, sin sobrescribir el valor vigente', async () => {
    const admin = await clienteAdmin();
    const { indicadorId, periodoId } = await prepararIndicador(admin);

    // Dos "sesiones" que cargaron la grilla al mismo tiempo, cuando la celda estaba vacía.
    await admin.recoleccion.guardarCelda.mutate({
      indicadorId, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10', versionEsperada: null
    });

    // La segunda "sesión" (versionEsperada todavía null, como si nunca hubiera visto la escritura
    // anterior) intenta guardar SU valor — se rechaza, no se sobrescribe en silencio.
    const { codigo, conflicto } = await capturarConflicto(admin.recoleccion.guardarCelda.mutate({
      indicadorId, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '99', versionEsperada: null
    }));
    expect(codigo).toBe('CONFLICT');
    expect(conflicto?.valorActual).toBe(10);
    expect(conflicto?.capturadoPor).not.toBeNull();

    // El valor vigente sigue siendo el de la primera escritura — la segunda nunca se aplicó.
    const captura = await admin.recoleccion.captura.query({ indicadorId, periodoId });
    expect(captura.filas.find((f) => f.claveDesagregacion === 'GENERAL')?.valor).toBe(10);
  });

  it('recargar (leer la versión vigente) y reintentar con ESA versión sí se acepta', async () => {
    const admin = await clienteAdmin();
    const { indicadorId, periodoId } = await prepararIndicador(admin);

    await admin.recoleccion.guardarCelda.mutate({
      indicadorId, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10', versionEsperada: null
    });
    const capturaVigente = await admin.recoleccion.captura.query({ indicadorId, periodoId });
    const versionVigente = capturaVigente.filas.find((f) => f.claveDesagregacion === 'GENERAL')!.actualizadoEn;
    expect(versionVigente).not.toBeNull();

    const { valor } = await admin.recoleccion.guardarCelda.mutate({
      indicadorId, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '20', versionEsperada: versionVigente
    });
    expect(valor).toBe(20);
  });

  it('sin versionEsperada (campo omitido), nunca se chequea concurrencia — compatibilidad con llamadores que no la conocen', async () => {
    const admin = await clienteAdmin();
    const { indicadorId, periodoId } = await prepararIndicador(admin);

    await admin.recoleccion.guardarCelda.mutate({ indicadorId, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10' });
    // Segunda escritura sin versionEsperada tampoco chequea, aunque la celda ya cambió de versión.
    const { valor } = await admin.recoleccion.guardarCelda.mutate({
      indicadorId, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '30'
    });
    expect(valor).toBe(30);
  });
});
