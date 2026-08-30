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

describe('Roles — semillas Validador/Técnico (Batch X, X6/X7)', () => {
  it('Validador (equipo) trae los permisos de Colaborador + validar + auditoría del equipo; Técnico (general) trae todo excepto administrar roles (Batch Y)', async () => {
    const admin = await clienteAdmin();
    const roles = await admin.roles.listar.query();

    const validador = roles.find((r) => r.nombre === 'Validador');
    expect(validador?.ambito).toBe('equipo');
    expect(validador?.esSistema).toBe(true);
    expect(validador?.permisos).toEqual(
      expect.arrayContaining(['resultados.ver.equipo', 'resultados.registrar.equipo', 'resultados.validar.equipo', 'auditoria.ver.equipo'])
    );
    expect(validador?.permisos).not.toContain('equipo.miembros.gestionar');

    // Batch Y, pedido explícito: "todas las acciones, excepto añadir roles" — todos los
    // permisos generales existentes, salvo `roles.administrar` (asignar/desasignar roles).
    const tecnico = roles.find((r) => r.nombre === 'Técnico');
    expect(tecnico?.ambito).toBe('general');
    expect(tecnico?.esSistema).toBe(true);
    expect(tecnico?.permisos).toEqual(
      expect.arrayContaining([
        'indicadores.ver.todos', 'resultados.ver.todos', 'resultados.registrar.todos', 'resultados.validar.todos',
        'auditoria.ver.todos', 'catalogos.administrar', 'respaldo.importarExportar', 'categorias.administrar',
        'equipos.administrar', 'origenes.administrar'
      ])
    );
    expect(tecnico?.permisos).not.toContain('roles.administrar');
  });

  it('ninguno de los dos se puede borrar (esSistema)', async () => {
    const admin = await clienteAdmin();
    const roles = await admin.roles.listar.query();
    for (const nombre of ['Validador', 'Técnico']) {
      const rol = roles.find((r) => r.nombre === nombre)!;
      expect(await codigoError(admin.roles.eliminar.mutate({ id: rol.id }))).toBe('BAD_REQUEST');
    }
  });
});

describe('Permisos de delegación puntual (Batch X, X6/X7) — Modificar X / Administrar X / roles.administrar', () => {
  async function usuarioConPermisoDeEquipo(nombreUsuario: string, permiso: string) {
    const admin = await clienteAdmin();
    const equipo = await admin.equipos.guardar.mutate({
      id: '', nombre: `Equipo ${nombreUsuario}`, descripcion: '', padreId: null, activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    const rol = await admin.roles.guardar.mutate({
      id: '', nombre: `Rol ${nombreUsuario}`, ambito: 'equipo', permisos: [permiso], esSistema: false, creadoEn: '', actualizadoEn: ''
    });
    await admin.usuarios.crear.mutate({ nombreUsuario, nombreCompleto: nombreUsuario, password: 'contrasenaSegura1' });
    const usuarios = await admin.usuarios.listar.query();
    const id = usuarios.find((u) => u.nombreUsuario === nombreUsuario)!.id;
    await admin.usuarios.establecerEquipo.mutate({ id, equipoId: equipo.id, rolEquipoId: rol.id });

    const cliente = crearCliente(fetchConCookies());
    await cliente.auth.login.mutate({ nombreUsuario, password: 'contrasenaSegura1' });
    return cliente;
  }

  async function usuarioConPermisoGeneral(nombreUsuario: string, permiso: string) {
    const admin = await clienteAdmin();
    const rol = await admin.roles.guardar.mutate({
      id: '', nombre: `Rol ${nombreUsuario}`, ambito: 'general', permisos: [permiso], esSistema: false, creadoEn: '', actualizadoEn: ''
    });
    await admin.usuarios.crear.mutate({ nombreUsuario, nombreCompleto: nombreUsuario, password: 'contrasenaSegura1', rolGeneralId: rol.id });

    const cliente = crearCliente(fetchConCookies());
    await cliente.auth.login.mutate({ nombreUsuario, password: 'contrasenaSegura1' });
    return cliente;
  }

  it('"indicadores.modificar" (equipo) alcanza para indicadores.guardar sin catalogos.administrar; sin ese permiso se rechaza', async () => {
    const admin = await clienteAdmin();
    const sinPermiso = await usuarioConPermisoDeEquipo('sin.mod.indicadores', 'resultados.ver.equipo');
    const conPermiso = await usuarioConPermisoDeEquipo('con.mod.indicadores', 'indicadores.modificar');

    const nuevoIndicador = {
      id: '', codigo: '', nombre: 'Probar permiso', definicion: 'x', formaCalculo: null, periodicidad: 'Mensual',
      periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null, metaGlobal: null, desagregaciones: [],
      estado: 'Activo', responsable: null, categoria: null, equipo: null, unidadMedida: null, esCalculado: false, formula: null,
      requiereValidacion: true, creadoEn: '', actualizadoEn: ''
    };

    expect(await codigoError(sinPermiso.indicadores.guardar.mutate({ indicador: nuevoIndicador, valores: [] } as never))).toBe('FORBIDDEN');
    const guardado = await conPermiso.indicadores.guardar.mutate({ indicador: nuevoIndicador, valores: [] } as never);
    expect((guardado as { id: string }).id).not.toBe('');
    void admin;
  });

  it('"categorias.administrar" (general) alcanza para categorias.guardar sin catalogos.administrar; sin ese permiso se rechaza', async () => {
    const sinPermiso = await usuarioConPermisoGeneral('sin.admin.categorias', 'auditoria.ver.todos');
    const conPermiso = await usuarioConPermisoGeneral('con.admin.categorias', 'categorias.administrar');

    const nuevaCategoria = { id: '', nombre: 'Delegada', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null, creadoEn: '', actualizadoEn: '' };
    expect(await codigoError(sinPermiso.categorias.guardar.mutate(nuevaCategoria))).toBe('FORBIDDEN');
    const guardada = await conPermiso.categorias.guardar.mutate(nuevaCategoria);
    expect(guardada.id).not.toBe('');
  });

  it('"roles.administrar" (general) permite asignar el rol general de otro usuario; catalogos.administrar NO alcanza para esto', async () => {
    const admin = await clienteAdmin();
    const conRolesAdmin = await usuarioConPermisoGeneral('con.roles.admin', 'roles.administrar');
    const conCatalogosAdmin = await usuarioConPermisoGeneral('con.catalogos.admin', 'catalogos.administrar');

    await admin.usuarios.crear.mutate({ nombreUsuario: 'objetivo', nombreCompleto: 'Objetivo', password: 'contrasenaSegura1' });
    const objetivo = (await admin.usuarios.listar.query()).find((u) => u.nombreUsuario === 'objetivo')!;
    const roles = await admin.roles.listar.query();
    const rolGeneral = roles.find((r) => r.nombre === 'Usuario estándar')!;

    expect(await codigoError(conCatalogosAdmin.usuarios.establecerRolGeneral.mutate({ id: objetivo.id, rolGeneralId: rolGeneral.id })))
      .toBe('FORBIDDEN');
    await expect(conRolesAdmin.usuarios.establecerRolGeneral.mutate({ id: objetivo.id, rolGeneralId: rolGeneral.id })).resolves.toBeUndefined();
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
  it('un colaborador de un equipo solo ve/registra los indicadores de SU equipo, sin poder validar (Batch Z: "Visitante", sin permisos, es el default)', async () => {
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

    // Seguimiento: solo ve el indicador de su equipo — el rol general por defecto es "Visitante"
    // (Batch Z, sin ningún permiso), así que la única visibilidad que tiene viene de su rol de
    // equipo (Colaborador: ver/registrar SOLO del propio equipo).
    const tablero = await clienteColab.seguimiento.tablero.query();
    expect(tablero.map((f) => f.indicadorId)).toEqual([indicadorA.id]);

    // Períodos disponibles: propio equipo sí, el ajeno FORBIDDEN — sin permiso de "ver" alguno
    // sobre el equipo B.
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

describe('Orígenes automáticos — origenes.listar redacta credenciales sin "origenes.administrar" (audit de seguridad, HIGH-2)', () => {
  it('un usuario sin permiso alguno recibe la configuración SIN la contraseña; quien administra orígenes (o el admin) la recibe completa', async () => {
    const admin = await clienteAdmin();
    const origen = await admin.origenes.guardar.mutate({
      id: '', nombre: 'SQL de prueba', tipo: 'SQL', descripcion: '',
      configuracion: { servidor: 'db.interno.local', usuario: 'sa', contrasena: 'SuperSecreta123' },
      parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    } as never) as { id: string };

    await admin.usuarios.crear.mutate({ nombreUsuario: 'sin.permisos.origenes', nombreCompleto: 'Sin Permisos', password: 'contrasenaSegura1' });
    const clienteSinPermisos = crearCliente(fetchConCookies());
    await clienteSinPermisos.auth.login.mutate({ nombreUsuario: 'sin.permisos.origenes', password: 'contrasenaSegura1' });

    const rol = await admin.roles.guardar.mutate({
      id: '', nombre: 'Administra orígenes', ambito: 'general', permisos: ['origenes.administrar'], esSistema: false, creadoEn: '', actualizadoEn: ''
    });
    await admin.usuarios.crear.mutate({
      nombreUsuario: 'con.permiso.origenes', nombreCompleto: 'Con Permiso', password: 'contrasenaSegura1', rolGeneralId: rol.id
    });
    const clienteConPermiso = crearCliente(fetchConCookies());
    await clienteConPermiso.auth.login.mutate({ nombreUsuario: 'con.permiso.origenes', password: 'contrasenaSegura1' });

    const [comoSinPermisos] = await clienteSinPermisos.origenes.listar.query();
    expect(comoSinPermisos!.id).toBe(origen.id);
    expect(comoSinPermisos!.configuracion.contrasena).toBeUndefined();
    expect(comoSinPermisos!.configuracion.servidor).toBe('db.interno.local'); // el resto de la config (no secreta) sigue viajando, para poblar dropdowns

    const [comoConPermiso] = await clienteConPermiso.origenes.listar.query();
    expect(comoConPermiso!.configuracion.contrasena).toBe('SuperSecreta123');

    const [comoAdmin] = await admin.origenes.listar.query();
    expect(comoAdmin!.configuracion.contrasena).toBe('SuperSecreta123');
  });
});
