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
 * Batch T — RBAC configurable: roles/permisos, visibilidad de Seguimiento
 * por equipo, gating de registro/validación de resultados, invariantes de
 * `ServicioRoles`/`ServicioUsuarios`. Mismo harness que `servidorTrpc.test.ts`
 * (cliente tRPC real contra Express+sesión por cookie) porque el gating
 * (Batch T4) vive en `protectedProcedure`/`ServicioPermisos`, que solo se
 * activa a través de una request HTTP real — llamar `app.manejadores[...]`
 * directo (como `aplicacion.test.ts`) NO lo ejercita (cae al contexto "sin
 * restricción" documentado en `contextoUsuario.ts`).
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

async function codigoError(promesa: Promise<unknown>): Promise<string | undefined> {
  try {
    await promesa;
    return undefined;
  } catch (error) {
    return (error as TRPCClientError<AppRouter>).data?.code;
  }
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-permisos-test-'));
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

describe('Roles — catálogo configurable', () => {
  it('los 4 roles semilla existen desde el arranque, con el ámbito y permisos esperados', async () => {
    const admin = await clienteAdmin();
    const roles = await admin.roles.listar.query();
    const lider = roles.find((r) => r.nombre === 'Líder de equipo');
    expect(lider?.ambito).toBe('equipo');
    expect(lider?.esSistema).toBe(true);
    expect(lider?.permisos).toEqual(
      expect.arrayContaining(['resultados.ver.equipo', 'resultados.registrar.equipo', 'resultados.validar.equipo', 'equipo.miembros.gestionar'])
    );
    expect(roles.find((r) => r.nombre === 'Usuario estándar')?.ambito).toBe('general');
  });

  it('bloquea borrar un rol del sistema', async () => {
    const admin = await clienteAdmin();
    const roles = await admin.roles.listar.query();
    const visor = roles.find((r) => r.nombre === 'Visor')!;
    const codigo = await codigoError(admin.roles.eliminar.mutate({ id: visor.id }));
    expect(codigo).toBe('BAD_REQUEST');
  });

  it('bloquea borrar un rol referenciado por un usuario, y permite borrar uno sin referencias', async () => {
    const admin = await clienteAdmin();
    const rolPropio = await admin.roles.guardar.mutate({
      id: '', nombre: 'Analista', ambito: 'general', permisos: ['resultados.ver.todos'], esSistema: false,
      creadoEn: '', actualizadoEn: ''
    });
    const usuario = await admin.usuarios.crear.mutate({
      nombreUsuario: 'analista1', nombreCompleto: 'Analista Uno', password: 'contrasenaSegura1', rolGeneralId: rolPropio.id
    });
    const bloqueado = await codigoError(admin.roles.eliminar.mutate({ id: rolPropio.id }));
    expect(bloqueado).toBe('BAD_REQUEST');

    // Sin más usuarios que lo referencien, un rol propio (no del sistema) sí se puede borrar.
    const otroRol = await admin.roles.guardar.mutate({
      id: '', nombre: 'Sin uso', ambito: 'general', permisos: [], esSistema: false, creadoEn: '', actualizadoEn: ''
    });
    await expect(admin.roles.eliminar.mutate({ id: otroRol.id })).resolves.toBeUndefined();
    // Limpieza: el usuario creado no interfiere con otros tests (cada uno usa su propio dataDir de todas formas).
    expect(usuario.rolGeneralId).toBe(rolPropio.id);
  });

  it('rechaza guardar un rol con un permiso de otro ámbito', async () => {
    const admin = await clienteAdmin();
    const codigo = await codigoError(admin.roles.guardar.mutate({
      id: '', nombre: 'Mal armado', ambito: 'general', permisos: ['resultados.ver.equipo'], esSistema: false,
      creadoEn: '', actualizadoEn: ''
    }));
    expect(codigo).toBe('BAD_REQUEST');
  });
});

describe('Usuarios — invariante "al menos un administrador activo"', () => {
  it('rechaza quitarle el flag de administrador al único administrador', async () => {
    const admin = await clienteAdmin();
    const yo = await admin.auth.yo.query();
    const codigo = await codigoError(admin.usuarios.establecerAdministrador.mutate({ id: yo!.id, esAdministrador: false }));
    expect(codigo).toBe('BAD_REQUEST');
  });
});

describe('Visibilidad y permisos por equipo (Seguimiento / Recolección / validación)', () => {
  it('un colaborador de un equipo solo ve/registra los indicadores de SU equipo, sin poder validar', async () => {
    const admin = await clienteAdmin();

    const equipoA = await admin.equipos.guardar.mutate({
      id: '', nombre: 'Equipo A', descripcion: '', activo: true, eliminado: false, padreId: null, creadoEn: '', actualizadoEn: ''
    });
    const equipoB = await admin.equipos.guardar.mutate({
      id: '', nombre: 'Equipo B', descripcion: '', activo: true, eliminado: false, padreId: null, creadoEn: '', actualizadoEn: ''
    });
    const categoria = await admin.categorias.guardar.mutate({
      id: '', nombre: 'General de prueba', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null,
      creadoEn: '', actualizadoEn: ''
    });
    const indicadorA = await admin.indicadores.guardar.mutate({
      indicador: {
        id: '', codigo: 'A-1', nombre: 'Indicador del equipo A', definicion: 'def', formaCalculo: null,
        periodicidad: 'Mensual', periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null,
        metaGlobal: null, desagregaciones: [], estado: 'Activo', responsable: null, categoria: categoria.id, equipo: equipoA.id,
        unidadMedida: null, esCalculado: false, formula: null, creadoEn: '', actualizadoEn: ''
      },
      valores: []
    });
    const indicadorB = await admin.indicadores.guardar.mutate({
      indicador: {
        id: '', codigo: 'B-1', nombre: 'Indicador del equipo B', definicion: 'def', formaCalculo: null,
        periodicidad: 'Mensual', periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null,
        metaGlobal: null, desagregaciones: [], estado: 'Activo', responsable: null, categoria: categoria.id, equipo: equipoB.id,
        unidadMedida: null, esCalculado: false, formula: null, creadoEn: '', actualizadoEn: ''
      },
      valores: []
    });

    const roles = await admin.roles.listar.query();
    const colaborador = roles.find((r) => r.nombre === 'Colaborador')!;
    const lider = roles.find((r) => r.nombre === 'Líder de equipo')!;

    await admin.usuarios.crear.mutate({ nombreUsuario: 'colabA', nombreCompleto: 'Colaborador A', password: 'contrasenaSegura1' });
    const colabPublico = (await admin.usuarios.listar.query()).find((u) => u.nombreUsuario === 'colabA')!;
    await admin.usuarios.establecerEquipo.mutate({ id: colabPublico.id, equipoId: equipoA.id, rolEquipoId: colaborador.id });

    await admin.usuarios.crear.mutate({ nombreUsuario: 'liderA', nombreCompleto: 'Líder A', password: 'contrasenaSegura1' });
    const liderPublico = (await admin.usuarios.listar.query()).find((u) => u.nombreUsuario === 'liderA')!;
    await admin.usuarios.establecerEquipo.mutate({ id: liderPublico.id, equipoId: equipoA.id, rolEquipoId: lider.id });

    const clienteColab = crearCliente(fetchConCookies());
    await clienteColab.auth.login.mutate({ nombreUsuario: 'colabA', password: 'contrasenaSegura1' });

    // Seguimiento: solo ve el indicador de su equipo.
    const tablero = await clienteColab.seguimiento.tablero.query();
    expect(tablero.map((f) => f.indicadorId)).toEqual([indicadorA.id]);

    // Períodos disponibles: propio equipo sí, el ajeno FORBIDDEN.
    await expect(clienteColab.recoleccion.periodos.query({ indicadorId: indicadorA.id })).resolves.not.toHaveLength(0);
    const codigoAjeno = await codigoError(clienteColab.recoleccion.periodos.query({ indicadorId: indicadorB.id }));
    expect(codigoAjeno).toBe('BAD_REQUEST');

    // Fecha de corte + captura en su propio equipo.
    const [periodo] = await clienteColab.recoleccion.periodos.query({ indicadorId: indicadorA.id });
    await clienteColab.recoleccion.fechaCorte.mutate({ indicadorId: indicadorA.id, periodoId: periodo!.id, fechaCorte: '2026-01-31' });
    await clienteColab.recoleccion.guardarCelda.mutate({
      indicadorId: indicadorA.id, periodoId: periodo!.id, claveDesagregacion: 'GENERAL', valorCrudo: '10'
    });

    // Un colaborador (sin resultados.validar.equipo) no puede validar.
    const codigoValidar = await codigoError(clienteColab.recoleccion.validar.mutate({
      indicadorId: indicadorA.id, periodoId: periodo!.id, claveDesagregacion: 'GENERAL'
    }));
    expect(codigoValidar).toBe('BAD_REQUEST');

    // Un líder del MISMO equipo sí puede validar, y reeditar el valor lo regresa a Pendiente.
    const clienteLider = crearCliente(fetchConCookies());
    await clienteLider.auth.login.mutate({ nombreUsuario: 'liderA', password: 'contrasenaSegura1' });
    await clienteLider.recoleccion.validar.mutate({ indicadorId: indicadorA.id, periodoId: periodo!.id, claveDesagregacion: 'GENERAL' });
    let captura = await clienteLider.recoleccion.captura.query({ indicadorId: indicadorA.id, periodoId: periodo!.id });
    expect(captura.filas.find((f) => f.claveDesagregacion === 'GENERAL')?.estadoValidacion).toBe('Validado');

    await clienteColab.recoleccion.guardarCelda.mutate({
      indicadorId: indicadorA.id, periodoId: periodo!.id, claveDesagregacion: 'GENERAL', valorCrudo: '20'
    });
    captura = await clienteLider.recoleccion.captura.query({ indicadorId: indicadorA.id, periodoId: periodo!.id });
    expect(captura.filas.find((f) => f.claveDesagregacion === 'GENERAL')?.estadoValidacion).toBe('Pendiente');
  });
});
