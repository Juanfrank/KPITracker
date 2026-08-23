import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { componerAplicacionServidor } from '../../src/server/composicionServidor';
import type { AplicacionServidor } from '../../src/server/composicionServidor';
import { seleccionInicial, aSeleccionIpc, alternarCategoria } from '../../src/renderer/src/modulos/admin/modeloSeleccion';
import { Periodicidad, TipoDato } from '@domain/index';
import type { Atributo, Indicador, Lista, OrigenAutomatico, ReglaNegocio, Responsable, Categoria } from '@domain/index';

/**
 * Formato de respaldo de perfil + importación selectiva (Batch N): siempre
 * opera sobre el perfil ACTIVO. Prueba `RespaldoPerfilService` directamente
 * (sin pasar por `respaldo:*` IPC, que envuelve diálogos nativos de
 * Electron no disponibles en este entorno headless) contra dos instancias
 * reales de `componerAplicacionServidor` en tmpdirs distintos.
 */

function indicador(parcial: Partial<Indicador> = {}): Indicador {
  return {
    id: '', codigo: '', nombre: 'Indicador de prueba', definicion: 'Definición', formaCalculo: null, periodicidad: Periodicidad.Trimestral,
    periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null, metaGlobal: null, desagregaciones: [],
    estado: 'Activo', responsable: null, categoria: null, unidadMedida: null, esCalculado: false, formula: null,
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

function responsable(parcial: Partial<Responsable> = {}): Responsable {
  return { id: '', nombre: 'Ana', correo: null, activo: true, eliminado: false, creadoEn: '', actualizadoEn: '', ...parcial };
}

function categoria(parcial: Partial<Categoria> = {}): Categoria {
  return { id: '', nombre: 'Estratégico', descripcion: '', activo: true, eliminado: false, creadoEn: '', actualizadoEn: '', ...parcial };
}

function origen(parcial: Partial<OrigenAutomatico> = {}): OrigenAutomatico {
  return {
    id: '', nombre: 'API demo', tipo: 'API', descripcion: '', configuracion: { url: 'http://localhost' },
    parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: '',
    ...parcial
  };
}

let dataDirA: string;
let dataDirB: string;
let appA: AplicacionServidor;
let appB: AplicacionServidor;

beforeEach(async () => {
  dataDirA = mkdtempSync(join(tmpdir(), 'kpitracker-respaldo-a-'));
  dataDirB = mkdtempSync(join(tmpdir(), 'kpitracker-respaldo-b-'));
  appA = await componerAplicacionServidor(dataDirA, '9.9.9');
  appB = await componerAplicacionServidor(dataDirB);
});

afterEach(async () => {
  await appA.cerrar();
  await appB.cerrar();
  rmSync(dataDirA, { recursive: true, force: true });
  rmSync(dataDirB, { recursive: true, force: true });
});

/** Puebla el perfil A con al menos un ítem de cada una de las 12 categorías. */
async function poblarPerfilA(): Promise<void> {
  const config = await appA.manejadores['config:obtener'](undefined);
  await appA.manejadores['config:guardar']({ ...config, nombreInstitucion: 'Institución A' });

  await appA.manejadores['periodicidades:guardar']({
    id: '', nombre: 'Semestres', descripcion: '',
    cortes: [
      { numero: 1, etiqueta: 'S1', mesInicio: 1, mesFin: 6 },
      { numero: 2, etiqueta: 'S2', mesInicio: 7, mesFin: 12 }
    ],
    creadoEn: '', actualizadoEn: ''
  });
  const resp = await appA.manejadores['responsables:guardar'](responsable());
  const cat = await appA.manejadores['categorias:guardar'](categoria());
  const l = await appA.manejadores['listas:guardar'](lista());
  await appA.manejadores['listas:guardarElemento']({
    id: '', listaId: l.id, codigo: 'SEXO-01', nombre: 'Masculino', descripcion: '', orden: 1, padreCodigo: null, activo: true
  });
  const at = await appA.manejadores['atributos:guardar'](atributo());
  const or = await appA.manejadores['origenes:guardar'](origen());
  const ind = await appA.manejadores['indicadores:guardar']({
    indicador: indicador({ nombre: 'Indicador A', responsable: resp.id, categoria: cat.id, desagregaciones: [l.id] }),
    valores: []
  });
  await appA.manejadores['metas:guardar']({
    id: '', indicadorId: ind.id, claveDesagregacion: 'GENERAL', valor: 90,
    periodicidadMedicion: Periodicidad.Anual, periodicidadPersonalizadaId: null, metodoCalculo: 'Promedio', anioVigencia: 2026,
    creadoEn: '', actualizadoEn: ''
  });
  await appA.manejadores['reglas:guardar'](regla({ atributoObjetivoId: at.id }));
  await appA.manejadores['automatizacion:guardar']({
    id: '', indicadorId: ind.id, origenAutomaticoId: or.id, parametrosDinamicos: [], script: 'SELECT 1',
    columnaValor: null, mapeoColumnas: [], desagregacionesOmitidas: [], creadoEn: '', actualizadoEn: ''
  });
  await appA.manejadores['listas:guardarAliasOrigen']({ id: '', listaId: l.id, origenAutomaticoId: or.id, alias: 'SEXO', creadoEn: '', actualizadoEn: '' });
}

describe('RespaldoPerfilService — round-trip completo', () => {
  it('exporta el perfil A poblado con las 12 categorías e importa "todos" en un perfil B vacío', async () => {
    await poblarPerfilA();
    const json = await appA.infra.respaldoPerfil.exportar();

    const resumen = appB.infra.respaldoPerfil.leer(json);
    expect(resumen.schemaVersion).toBe(1);
    expect(resumen.categorias.map((c) => c.categoria).sort()).toEqual(
      ['aliasDesagregacion', 'atributos', 'automatizaciones', 'categorias', 'configuracionGeneral', 'indicadores',
        'listas', 'metas', 'origenes', 'periodicidades', 'reglas', 'responsables'].sort()
    );
    for (const c of resumen.categorias) {
      if (c.atomica) continue;
      expect(c.total).toBeGreaterThan(0);
    }

    const seleccion = aSeleccionIpc(seleccionInicial(resumen));
    const resultado = await appB.infra.respaldoPerfil.importar(json, seleccion);
    expect(resultado.advertencias).toEqual([]);

    expect(await appB.manejadores['indicadores:listar'](undefined)).toHaveLength(1);
    expect(await appB.manejadores['responsables:listar'](undefined)).toHaveLength(1);
    expect(await appB.manejadores['categorias:listar'](undefined)).toHaveLength(1);
    expect(await appB.manejadores['listas:listar'](undefined)).toHaveLength(1);
    expect(await appB.manejadores['atributos:listar'](undefined)).toHaveLength(1);
    expect(await appB.manejadores['origenes:listar'](undefined)).toHaveLength(1);
    expect(await appB.manejadores['reglas:listar'](undefined)).toHaveLength(1);
    expect(await appB.manejadores['periodicidades:listar'](undefined)).toHaveLength(1);

    const [listaB] = await appB.manejadores['listas:listar'](undefined);
    expect(await appB.manejadores['listas:elementos']({ listaId: listaB!.id })).toHaveLength(1);

    const [indicadorB] = await appB.manejadores['indicadores:listar'](undefined);
    expect(await appB.manejadores['metas:listar']({ indicadorId: indicadorB!.id })).toHaveLength(1);
    expect(await appB.manejadores['automatizacion:obtener']({ indicadorId: indicadorB!.id })).not.toBeNull();
    expect(await appB.manejadores['listas:aliasOrigen']({ listaId: listaB!.id })).toHaveLength(1);

    const configB = await appB.manejadores['config:obtener'](undefined);
    expect(configB.nombreInstitucion).toBe('Institución A');
  });
});

describe('RespaldoPerfilService — selección parcial', () => {
  it('deseleccionar una categoría completa la excluye por completo de la importación', async () => {
    await poblarPerfilA();
    const json = await appA.infra.respaldoPerfil.exportar();
    const resumen = appB.infra.respaldoPerfil.leer(json);

    let estado = seleccionInicial(resumen);
    estado = alternarCategoria(estado, 'reglas', false);
    const resultado = await appB.infra.respaldoPerfil.importar(json, aSeleccionIpc(estado));

    expect(resultado.importados.reglas).toBe(0);
    expect(await appB.manejadores['reglas:listar'](undefined)).toHaveLength(0);
    // El resto de las categorías seleccionadas sí se importó.
    expect(await appB.manejadores['indicadores:listar'](undefined)).toHaveLength(1);
  });

  it('seleccionar solo un id puntual dentro de una categoría importa únicamente ese ítem', async () => {
    await appA.manejadores['responsables:guardar'](responsable({ nombre: 'Solo este' }));
    await appA.manejadores['responsables:guardar'](responsable({ nombre: 'No este' }));
    const json = await appA.infra.respaldoPerfil.exportar();
    const resumen = appB.infra.respaldoPerfil.leer(json);
    const catResponsables = resumen.categorias.find((c) => c.categoria === 'responsables')!;
    const item = catResponsables.items.find((i) => i.nombre === 'Solo este')!;

    const resultado = await appB.infra.respaldoPerfil.importar(json, { responsables: [item.id] });
    expect(resultado.importados.responsables).toBe(1);
    const importados = await appB.manejadores['responsables:listar'](undefined);
    expect(importados).toHaveLength(1);
    expect(importados[0]?.nombre).toBe('Solo este');
  });

  it('los elementos de una lista siguen a su lista seleccionada — no aparecen huérfanos si la lista no se selecciona', async () => {
    const l = await appA.manejadores['listas:guardar'](lista({ nombre: 'Con elementos' }));
    await appA.manejadores['listas:guardarElemento']({
      id: '', listaId: l.id, codigo: 'SEXO-01', nombre: 'M', descripcion: '', orden: 1, padreCodigo: null, activo: true
    });
    const json = await appA.infra.respaldoPerfil.exportar();

    const resultado = await appB.infra.respaldoPerfil.importar(json, {}); // ninguna categoría seleccionada
    expect(resultado.importados.listas).toBe(0);
    expect(await appB.manejadores['listas:listar'](undefined)).toHaveLength(0);
  });
});

describe('RespaldoPerfilService — dependencias rotas: advertencia y omisión, nunca excepción', () => {
  it('un atributo con listaId que no resuelve en el destino se omite con advertencia', async () => {
    const l = await appA.manejadores['listas:guardar'](lista({ nombre: 'Solo en A' }));
    await appA.manejadores['atributos:guardar'](atributo({ nombre: 'Región', tipoDato: TipoDato.SelectionList, listaId: l.id }));
    const json = await appA.infra.respaldoPerfil.exportar();

    // Selecciona el atributo pero NO la lista de la que depende.
    const resultado = await appB.infra.respaldoPerfil.importar(json, { atributos: 'todos' });
    expect(resultado.importados.atributos).toBe(0);
    expect(resultado.omitidos.atributos).toBe(1);
    expect(resultado.advertencias.some((a) => a.includes('Región'))).toBe(true);
    expect(await appB.manejadores['atributos:listar'](undefined)).toHaveLength(0);
  });

  it('una meta sin su indicador en el destino se omite con advertencia', async () => {
    const ind = await appA.manejadores['indicadores:guardar']({ indicador: indicador({ nombre: 'Con meta' }), valores: [] });
    await appA.manejadores['metas:guardar']({
      id: '', indicadorId: ind.id, claveDesagregacion: 'GENERAL', valor: 50,
      periodicidadMedicion: Periodicidad.Anual, periodicidadPersonalizadaId: null, metodoCalculo: 'Promedio', anioVigencia: 2026,
      creadoEn: '', actualizadoEn: ''
    });
    const json = await appA.infra.respaldoPerfil.exportar();

    const resultado = await appB.infra.respaldoPerfil.importar(json, { metas: 'todos' }); // sin indicadores
    expect(resultado.omitidos.metas).toBe(1);
    expect(resultado.advertencias.length).toBeGreaterThan(0);
  });

  it('una automatización sin su origen automático en el destino se omite con advertencia', async () => {
    const or = await appA.manejadores['origenes:guardar'](origen({ nombre: 'Origen A' }));
    const ind = await appA.manejadores['indicadores:guardar']({ indicador: indicador({ nombre: 'Automatizado' }), valores: [] });
    await appA.manejadores['automatizacion:guardar']({
      id: '', indicadorId: ind.id, origenAutomaticoId: or.id, parametrosDinamicos: [], script: 'SELECT 1',
      columnaValor: null, mapeoColumnas: [], desagregacionesOmitidas: [], creadoEn: '', actualizadoEn: ''
    });
    const json = await appA.infra.respaldoPerfil.exportar();

    const resultado = await appB.infra.respaldoPerfil.importar(json, { indicadores: 'todos', automatizaciones: 'todos' }); // sin orígenes
    expect(resultado.importados.indicadores).toBe(1);
    expect(resultado.omitidos.automatizaciones).toBe(1);
  });
});

describe('RespaldoPerfilService — validación del formato', () => {
  it('rechaza un archivo de configuración portable ("kpitracker-config") con un mensaje que distingue ambos formatos', async () => {
    const jsonPortable = await appA.manejadores['portable:exportar'](undefined);
    expect(() => appB.infra.respaldoPerfil.leer(jsonPortable.json)).toThrow(/configuración portable/);
  });

  it('rechaza un JSON que no tiene el formato de respaldo', () => {
    expect(() => appB.infra.respaldoPerfil.leer(JSON.stringify({ foo: 'bar' }))).toThrow(/formato/);
  });

  it('rechaza un schemaVersion futura con un mensaje claro', () => {
    const archivo = {
      formato: 'kpitracker-respaldo-perfil', schemaVersion: 99, exportadoEn: new Date().toISOString(),
      configuracionGeneral: {}
    };
    expect(() => appB.infra.respaldoPerfil.leer(JSON.stringify(archivo))).toThrow(/versión más nueva/);
  });
});

describe('RespaldoPerfilService — no regresión de portable:*', () => {
  it('portable:exportar/portable:importar siguen funcionando exactamente igual', async () => {
    await appA.manejadores['listas:guardar'](lista({ nombre: 'Portable' }));
    const { json } = await appA.manejadores['portable:exportar'](undefined);
    const archivo = JSON.parse(json);
    expect(archivo.formato).toBe('kpitracker-config');

    const { advertencias } = await appB.manejadores['portable:importar']({ json });
    expect(advertencias).toEqual([]);
    expect(await appB.manejadores['listas:listar'](undefined)).toHaveLength(1);
  });
});
