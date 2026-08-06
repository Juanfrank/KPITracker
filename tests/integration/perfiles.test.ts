import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GestorPerfiles } from '../../src/main/perfiles/GestorPerfiles';
import { componerAplicacion } from '../../src/main/composicion';
import type { Aplicacion } from '../../src/main/composicion';

/**
 * `GestorPerfiles` recibe todas sus rutas por constructor (sin tocar
 * `electron`) — 100% testeable con un tmpdir real, sin mocks.
 */

let base: string;
let rutaRegistro: string;
let directorioBase: string;
let rutaDatosHeredada: string;

const ids = { nuevoId: (() => { let n = 0; return () => `id-${++n}`; })() };
const reloj = { hoyIso: () => '2026-01-01', ahoraIso: () => new Date().toISOString() };

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'kpitracker-gestor-perfiles-'));
  directorioBase = join(base, 'perfiles-base');
  mkdirSync(directorioBase, { recursive: true });
  rutaRegistro = join(base, 'perfiles.json');
  rutaDatosHeredada = join(base, 'Data');
  mkdirSync(rutaDatosHeredada, { recursive: true });
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

function crearGestor(): GestorPerfiles {
  return new GestorPerfiles(rutaRegistro, directorioBase, rutaDatosHeredada, ids, reloj);
}

describe('GestorPerfiles — migración de primer arranque', () => {
  it('migra el Data/ heredado a un perfil "Predeterminado" sin mover un solo archivo', async () => {
    writeFileSync(join(rutaDatosHeredada, 'trabajo.duckdb'), 'contenido de prueba');
    const gestor = crearGestor();

    const { perfiles, activoId } = await gestor.listar();
    expect(perfiles).toHaveLength(1);
    expect(perfiles[0]?.nombre).toBe('Predeterminado');
    expect(perfiles[0]?.ruta).toBe(rutaDatosHeredada);
    expect(activoId).toBe(perfiles[0]?.id);
    // El archivo sigue exactamente donde estaba — no se copió ni se movió.
    expect(existsSync(join(rutaDatosHeredada, 'trabajo.duckdb'))).toBe(true);
    expect(readFileSync(join(rutaDatosHeredada, 'trabajo.duckdb'), 'utf-8')).toBe('contenido de prueba');
  });

  it('es idempotente: cargar dos veces no crea un segundo perfil "Predeterminado"', async () => {
    const gestor = crearGestor();
    await gestor.cargar();
    const gestor2 = crearGestor();
    const { perfiles } = await gestor2.listar();
    expect(perfiles).toHaveLength(1);
  });

  it('un registro corrupto (JSON inválido) se regenera migrando el Data/ heredado, sin perderlo', async () => {
    writeFileSync(rutaRegistro, '{ esto no es json válido');
    const gestor = crearGestor();
    const { perfiles } = await gestor.listar();
    expect(perfiles).toHaveLength(1);
    expect(perfiles[0]?.nombre).toBe('Predeterminado');
    expect(perfiles[0]?.ruta).toBe(rutaDatosHeredada);
  });

  it('un registro que no valida el esquema se regenera igual', async () => {
    writeFileSync(rutaRegistro, JSON.stringify({ algo: 'inesperado' }));
    const gestor = crearGestor();
    const { perfiles } = await gestor.listar();
    expect(perfiles).toHaveLength(1);
    expect(perfiles[0]?.ruta).toBe(rutaDatosHeredada);
  });

  it('si perfilActivoId no resuelve (carpeta borrada a mano), cae al primer perfil de la lista', async () => {
    const gestor = crearGestor();
    await gestor.cargar();
    const otro = await gestor.crear('Otro perfil');
    const registro = JSON.parse(readFileSync(rutaRegistro, 'utf-8'));
    registro.perfilActivoId = 'id-inexistente';
    writeFileSync(rutaRegistro, JSON.stringify(registro));

    const gestor2 = crearGestor();
    const { activoId, perfiles } = await gestor2.listar();
    expect(perfiles.map((p) => p.id)).toContain(otro.id);
    expect(activoId).toBe(perfiles[0]?.id);
  });
});

describe('GestorPerfiles — CRUD', () => {
  it('crear rechaza un nombre duplicado (case-insensitive)', async () => {
    const gestor = crearGestor();
    await gestor.crear('Pruebas');
    await expect(gestor.crear('pruebas')).rejects.toThrow(/Ya existe/);
  });

  it('renombrar solo toca el nombre — nunca la ruta', async () => {
    const gestor = crearGestor();
    const creado = await gestor.crear('Original');
    const renombrado = await gestor.renombrar(creado.id, 'Nuevo nombre');
    expect(renombrado.nombre).toBe('Nuevo nombre');
    expect(renombrado.ruta).toBe(creado.ruta);
  });

  it('eliminar el perfil activo se rechaza', async () => {
    const gestor = crearGestor();
    const { activoId } = await gestor.listar();
    await gestor.crear('Otro'); // para que no sea también "el último"
    await expect(gestor.eliminar(activoId, false)).rejects.toThrow(/activo/);
  });

  it('eliminar el último perfil restante se rechaza (siempre es también el activo)', async () => {
    const gestor = crearGestor();
    const { activoId } = await gestor.listar();
    const otro = await gestor.crear('Otro');
    // Se cambia a "otro" para poder eliminar el "Predeterminado" original.
    await gestor.marcarActivo(otro.id);
    await gestor.eliminar(activoId, false);
    const { perfiles } = await gestor.listar();
    expect(perfiles).toHaveLength(1);
    // El único perfil que queda es, por invariante, siempre el activo — no hay forma de
    // que "el último" no sea también "el activo"; ambos rechazos comparten esta ruta.
    await expect(gestor.eliminar(otro.id, false)).rejects.toThrow(/activo|último/);
  });

  it('eliminar el penúltimo perfil (no activo, quedando uno solo) también se rechazaría de estar activo', async () => {
    const gestor = crearGestor();
    const primero = await gestor.crear('Uno');
    const segundo = await gestor.crear('Dos');
    await gestor.marcarActivo(primero.id);
    // "segundo" no es el activo y no es el último (hay 3 perfiles: Predeterminado, Uno, Dos) — se puede eliminar.
    await expect(gestor.eliminar(segundo.id, false)).resolves.not.toThrow();
    const { perfiles } = await gestor.listar();
    expect(perfiles.map((p) => p.nombre)).not.toContain('Dos');
  });

  it('eliminar sin borrarArchivos conserva el directorio; con borrarArchivos lo borra', async () => {
    const gestor = crearGestor();
    const conservado = await gestor.crear('Conservado');
    const borrado = await gestor.crear('Borrado');
    expect(existsSync(conservado.ruta)).toBe(true);
    expect(existsSync(borrado.ruta)).toBe(true);

    await gestor.eliminar(conservado.id, false);
    expect(existsSync(conservado.ruta)).toBe(true); // el directorio sigue en disco

    await gestor.eliminar(borrado.id, true);
    expect(existsSync(borrado.ruta)).toBe(false);
  });

  it('marcarActivo cambia perfilActivoId y persiste', async () => {
    const gestor = crearGestor();
    const nuevo = await gestor.crear('Nuevo activo');
    await gestor.marcarActivo(nuevo.id);
    const gestor2 = crearGestor();
    const { activoId } = await gestor2.listar();
    expect(activoId).toBe(nuevo.id);
  });
});

describe('GestorPerfiles — aislamiento entre perfiles (vía componerAplicacion real)', () => {
  let dataDirA: string;
  let dataDirB: string;
  let appA: Aplicacion | null = null;
  let appB: Aplicacion | null = null;

  beforeEach(() => {
    dataDirA = join(base, 'perfil-a');
    dataDirB = join(base, 'perfil-b');
  });

  afterEach(async () => {
    await appA?.cerrar();
    await appB?.cerrar();
  });

  it('escribir en el perfil A no es visible en B, y A conserva sus datos al volver', async () => {
    appA = await componerAplicacion(dataDirA);
    await appA.manejadores['responsables:guardar']({
      id: '', nombre: 'Solo en A', correo: null, activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    expect(await appA.manejadores['responsables:listar'](undefined)).toHaveLength(1);
    await appA.cerrar();
    appA = null;

    appB = await componerAplicacion(dataDirB);
    expect(await appB.manejadores['responsables:listar'](undefined)).toHaveLength(0);
    await appB.cerrar();
    appB = null;

    appA = await componerAplicacion(dataDirA);
    const responsables = await appA.manejadores['responsables:listar'](undefined);
    expect(responsables).toHaveLength(1);
    expect(responsables[0]?.nombre).toBe('Solo en A');
  });

  it('un cambio de perfil con escrituras "sucias" (sin esperar el debounce de Parquet) no pierde nada: cerrar() fuerza el flush', async () => {
    // Sin overrides de debounceMs: usa el default de producción (500ms) — el mismo que main/index.ts#cambiarPerfil
    // ejercita al hacer `desactivarPerfil()` (que llama `aplicacion.cerrar()`) inmediatamente tras escribir.
    appA = await componerAplicacion(dataDirA);
    await appA.manejadores['responsables:guardar']({
      id: '', nombre: 'Escrito justo antes del swap', correo: null, activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    // Se cierra de inmediato, sin ningún `await` adicional para dejar correr el debounce:
    // si `cerrar()` no forzara `sync.sincronizar()` antes de cerrar la conexión, este dato se perdería.
    await appA.cerrar();
    appA = null;

    appA = await componerAplicacion(dataDirA);
    const responsables = await appA.manejadores['responsables:listar'](undefined);
    expect(responsables).toHaveLength(1);
    expect(responsables[0]?.nombre).toBe('Escrito justo antes del swap');
  });
});
