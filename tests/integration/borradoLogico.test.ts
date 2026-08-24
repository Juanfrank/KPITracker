import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { componerAplicacionServidor } from '../../src/server/composicionServidor';
import type { AplicacionServidor } from '../../src/server/composicionServidor';
import { Periodicidad, TipoDato } from '@domain/index';
import type { Atributo, Categoria, Indicador, Lista, OrigenAutomatico, ReglaNegocio } from '@domain/index';

/**
 * Borrado lógico bloqueado por uso (Batch M): atributos, listas, reglas,
 * usuarios (responsables, unificados en Batch U), categorías y orígenes
 * automáticos no se borran físicamente
 * — `eliminar()` verifica referencias (bloquea con el detalle de qué los
 * usa) y marca `eliminado = true`, reversible vía `restaurar()`. Los hijos
 * (elementos de lista, valores de atributo) se conservan intactos.
 */

let dataDir: string;
let app: AplicacionServidor;

function indicador(parcial: Partial<Indicador> = {}): Indicador {
  return {
    id: '', codigo: '', nombre: 'Indicador de prueba', definicion: 'Definición', formaCalculo: null, periodicidad: Periodicidad.Trimestral,
    periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null, metaGlobal: null, desagregaciones: [],
    estado: 'Activo', responsable: null, categoria: null, equipo: null, unidadMedida: null, esCalculado: false, formula: null,
    creadoEn: '', actualizadoEn: '',
    ...parcial
  };
}

function lista(parcial: Partial<Lista> = {}): Lista {
  return {
    id: '', nombre: 'Sexo', descripcion: '', prefijo: 'SEXO', estado: 'Activa', version: 1, orden: 1,
    jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: '',
    ...parcial
  };
}

function atributo(parcial: Partial<Atributo> = {}): Atributo {
  return {
    id: '', entidad: 'Indicador', nombre: 'Prioridad', descripcion: '', grupo: 'General', orden: 1,
    visible: true, editable: true, obligatorio: false, valorPorDefecto: null, tipoDato: TipoDato.ShortText,
    listaId: null, validaciones: [], condicionVisibilidad: null, condicionObligatorio: null, filtrable: false,
    activo: true, eliminado: false, creadoEn: '', actualizadoEn: '',
    ...parcial
  };
}

function regla(parcial: Partial<ReglaNegocio> = {}): ReglaNegocio {
  return {
    id: '', nombre: 'Regla', descripcion: '', tipo: 'Visibilidad', entidad: 'Indicador', atributoObjetivoId: null,
    condicion: { op: 'eq', args: [{ attr: 'Nombre' }, { literal: 'x' }] }, mensajeError: null, activa: true,
    eliminado: false, creadoEn: '', actualizadoEn: '',
    ...parcial
  };
}

function categoria(parcial: Partial<Categoria> = {}): Categoria {
  return {
    id: '', nombre: 'Estratégico', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null,
    creadoEn: '', actualizadoEn: '', ...parcial
  };
}

function origen(parcial: Partial<OrigenAutomatico> = {}): OrigenAutomatico {
  return {
    id: '', nombre: 'API demo', tipo: 'API', descripcion: '', configuracion: {}, parametrosGenerales: [],
    activo: true, eliminado: false, creadoEn: '', actualizadoEn: '',
    ...parcial
  };
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-borrado-logico-'));
  app = await componerAplicacionServidor(dataDir);
});

afterEach(async () => {
  await app.cerrar();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('Borrado lógico — sin referencias: eliminar oculta, restaurar revela', () => {
  it('Atributo: eliminar lo oculta de listar(), incluirEliminados lo revela, restaurar lo devuelve', async () => {
    const a = await app.manejadores['atributos:guardar'](atributo({ nombre: 'Sin uso' }));
    await app.manejadores['atributos:eliminar']({ id: a.id });
    expect(await app.manejadores['atributos:listar'](undefined)).toHaveLength(0);
    const conEliminados = await app.manejadores['atributos:listar']({ incluirEliminados: true });
    expect(conEliminados).toHaveLength(1);
    expect(conEliminados[0]?.eliminado).toBe(true);
    expect(conEliminados[0]?.activo).toBe(false);

    await app.manejadores['atributos:restaurar']({ id: a.id });
    const restaurado = await app.manejadores['atributos:listar'](undefined);
    expect(restaurado).toHaveLength(1);
    expect(restaurado[0]?.eliminado).toBe(false);
    expect(restaurado[0]?.activo).toBe(true);
  });

  it('Lista: eliminar pasa estado a Inactiva, restaurar a Activa', async () => {
    const l = await app.manejadores['listas:guardar'](lista({ nombre: 'Sin uso', prefijo: 'SU' }));
    await app.manejadores['listas:eliminar']({ id: l.id });
    expect(await app.manejadores['listas:listar'](undefined)).toHaveLength(0);
    const [conEliminados] = await app.manejadores['listas:listar']({ incluirEliminados: true });
    expect(conEliminados?.eliminado).toBe(true);
    expect(conEliminados?.estado).toBe('Inactiva');

    await app.manejadores['listas:restaurar']({ id: l.id });
    const [restaurada] = await app.manejadores['listas:listar'](undefined);
    expect(restaurada?.eliminado).toBe(false);
    expect(restaurada?.estado).toBe('Activa');
  });

  it('ReglaNegocio: nada la referencia — eliminar nunca bloquea', async () => {
    const r = await app.manejadores['reglas:guardar'](regla({ nombre: 'Sin uso' }));
    await expect(app.manejadores['reglas:eliminar']({ id: r.id })).resolves.not.toThrow();
    expect(await app.manejadores['reglas:listar'](undefined)).toHaveLength(0);
    await app.manejadores['reglas:restaurar']({ id: r.id });
    expect(await app.manejadores['reglas:listar'](undefined)).toHaveLength(1);
  });

  // Batch U: Responsable se unificó dentro de Usuario — el CRUD/borrado lógico
  // equivalente vive en `ServicioUsuarios` (sin canal IPC).
  it('Usuario/Categoria/OrigenAutomatico: eliminar + restaurar sin referencias', async () => {
    const antes = await app.usuarios.listar();
    const u = await app.usuarios.crear({ nombreUsuario: 'sin-uso', nombreCompleto: 'Sin uso', password: 'contrasenaSegura1' });
    await app.usuarios.eliminar(u.id);
    expect(await app.usuarios.listar()).toHaveLength(antes.length);
    await app.usuarios.restaurar(u.id);
    expect(await app.usuarios.listar()).toHaveLength(antes.length + 1);

    // +1 en ambas aserciones: la categoría raíz "General" (Batch T) ya existe desde el arranque.
    const c = await app.manejadores['categorias:guardar'](categoria({ nombre: 'Sin uso' }));
    await app.manejadores['categorias:eliminar']({ id: c.id });
    expect(await app.manejadores['categorias:listar'](undefined)).toHaveLength(1);
    await app.manejadores['categorias:restaurar']({ id: c.id });
    expect(await app.manejadores['categorias:listar'](undefined)).toHaveLength(2);

    const o = await app.manejadores['origenes:guardar'](origen({ nombre: 'Sin uso' }));
    await app.manejadores['origenes:eliminar']({ id: o.id });
    expect(await app.manejadores['origenes:listar'](undefined)).toHaveLength(0);
    await app.manejadores['origenes:restaurar']({ id: o.id });
    expect(await app.manejadores['origenes:listar'](undefined)).toHaveLength(1);
  });
});

describe('Borrado lógico — bloqueo por referencia (con el nombre de quién lo usa)', () => {
  it('Lista referenciada por Indicador.desagregaciones bloquea la eliminación', async () => {
    const l = await app.manejadores['listas:guardar'](lista());
    await app.manejadores['indicadores:guardar']({
      indicador: indicador({ nombre: 'Cobertura por sexo', desagregaciones: [l.id] }), valores: []
    });
    await expect(app.manejadores['listas:eliminar']({ id: l.id })).rejects.toThrow(/en uso/);
    try {
      await app.manejadores['listas:eliminar']({ id: l.id });
      throw new Error('no debió llegar aquí');
    } catch (error) {
      const detalles = (error as Error & { detalles?: string[] }).detalles;
      expect(detalles?.some((d) => d.includes('Cobertura por sexo'))).toBe(true);
    }
  });

  it('Lista referenciada por Atributo.listaId bloquea la eliminación', async () => {
    const l = await app.manejadores['listas:guardar'](lista({ nombre: 'Región' }));
    await app.manejadores['atributos:guardar'](atributo({ nombre: 'Región del proyecto', tipoDato: TipoDato.SelectionList, listaId: l.id }));
    try {
      await app.manejadores['listas:eliminar']({ id: l.id });
      throw new Error('no debió llegar aquí');
    } catch (error) {
      const detalles = (error as Error & { detalles?: string[] }).detalles;
      expect(detalles?.some((d) => d.includes('Región del proyecto'))).toBe(true);
    }
  });

  it('Atributo referenciado por Regla.atributoObjetivoId bloquea la eliminación', async () => {
    const a = await app.manejadores['atributos:guardar'](atributo({ nombre: 'Justificación' }));
    await app.manejadores['reglas:guardar'](regla({ nombre: 'Justificación obligatoria', atributoObjetivoId: a.id }));
    try {
      await app.manejadores['atributos:eliminar']({ id: a.id });
      throw new Error('no debió llegar aquí');
    } catch (error) {
      const detalles = (error as Error & { detalles?: string[] }).detalles;
      expect(detalles?.some((d) => d.includes('Justificación obligatoria'))).toBe(true);
    }
  });

  it('Atributo con valor capturado en un Indicador bloquea la eliminación', async () => {
    const a = await app.manejadores['atributos:guardar'](atributo({ nombre: 'Observación adicional' }));
    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ nombre: 'Indicador con valor capturado' }),
      valores: [{ atributoId: a.id, entidadTipo: 'Indicador', entidadId: '', valorTexto: 'Nota', valorNumero: null, valorFecha: null, valorBooleano: null }]
    });
    expect(guardado.id).not.toBe('');
    try {
      await app.manejadores['atributos:eliminar']({ id: a.id });
      throw new Error('no debió llegar aquí');
    } catch (error) {
      const detalles = (error as Error & { detalles?: string[] }).detalles;
      expect(detalles?.some((d) => d.includes('Indicador con valor capturado'))).toBe(true);
    }
  });

  it('Usuario referenciado por Indicador.responsable bloquea la eliminación (Batch U unificó Usuario/Responsable)', async () => {
    const u = await app.usuarios.crear({ nombreUsuario: 'carla', nombreCompleto: 'Carla', password: 'contrasenaSegura1' });
    await app.manejadores['indicadores:guardar']({ indicador: indicador({ nombre: 'A cargo de Carla', responsable: u.id }), valores: [] });
    try {
      await app.usuarios.eliminar(u.id);
      throw new Error('no debió llegar aquí');
    } catch (error) {
      const detalles = (error as Error & { message?: string }).message;
      expect(detalles?.includes('A cargo de Carla')).toBe(true);
    }
  });

  it('Categoria referenciada por Indicador.categoria bloquea la eliminación', async () => {
    const c = await app.manejadores['categorias:guardar'](categoria({ nombre: 'Prioritario' }));
    await app.manejadores['indicadores:guardar']({ indicador: indicador({ nombre: 'Indicador prioritario', categoria: c.id }), valores: [] });
    try {
      await app.manejadores['categorias:eliminar']({ id: c.id });
      throw new Error('no debió llegar aquí');
    } catch (error) {
      const detalles = (error as Error & { detalles?: string[] }).detalles;
      expect(detalles?.some((d) => d.includes('Indicador prioritario'))).toBe(true);
    }
  });

  it('OrigenAutomatico referenciado por la automatización de un Indicador bloquea la eliminación', async () => {
    const o = await app.manejadores['origenes:guardar'](origen({ nombre: 'SQL demo' }));
    const guardado = await app.manejadores['indicadores:guardar']({ indicador: indicador({ nombre: 'Indicador automatizado' }), valores: [] });
    await app.manejadores['automatizacion:guardar']({
      id: '', indicadorId: guardado.id, origenAutomaticoId: o.id, parametrosDinamicos: [], script: 'SELECT 1',
      columnaValor: null, mapeoColumnas: [], desagregacionesOmitidas: [], creadoEn: '', actualizadoEn: ''
    });
    try {
      await app.manejadores['origenes:eliminar']({ id: o.id });
      throw new Error('no debió llegar aquí');
    } catch (error) {
      const detalles = (error as Error & { detalles?: string[] }).detalles;
      expect(detalles?.some((d) => d.includes('Indicador automatizado'))).toBe(true);
    }
  });
});

describe('Borrado lógico — hijos preservados y persistencia', () => {
  it('los elementos de una lista eliminada se conservan y reaparecen al restaurar', async () => {
    const l = await app.manejadores['listas:guardar'](lista({ nombre: 'Sin uso dos', prefijo: 'SUD' }));
    await app.manejadores['listas:guardarElemento']({
      id: '', listaId: l.id, codigo: 'SUD-01', nombre: 'Elemento uno', descripcion: '', orden: 1, padreCodigo: null, activo: true
    });
    await app.manejadores['listas:eliminar']({ id: l.id });
    expect(await app.manejadores['listas:elementos']({ listaId: l.id })).toHaveLength(1);
    await app.manejadores['listas:restaurar']({ id: l.id });
    expect(await app.manejadores['listas:elementos']({ listaId: l.id })).toHaveLength(1);
  });

  it('el estado eliminado persiste tras cerrar y reabrir la aplicación (round-trip)', async () => {
    const antes = await app.usuarios.listar();
    const u = await app.usuarios.crear({ nombreUsuario: 'persistente', nombreCompleto: 'Persistente', password: 'contrasenaSegura1' });
    await app.usuarios.eliminar(u.id);
    await app.cerrar();

    app = await componerAplicacionServidor(dataDir);
    const conEliminados = await app.usuarios.listar(true);
    const restaurado = conEliminados.find((x) => x.id === u.id);
    expect(restaurado?.eliminado).toBe(true);
    expect(await app.usuarios.listar()).toHaveLength(antes.length);
  });
});
