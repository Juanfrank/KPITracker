import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { componerAplicacionServidor } from '../../src/server/composicionServidor';
import type { AplicacionServidor } from '../../src/server/composicionServidor';
import { Periodicidad } from '@domain/index';
import type { Categoria, CorteMedicion, Indicador, Meta, Resultado } from '@domain/index';

/**
 * Batch Y — "Cortes de medición" (Configuración de Metas, reubicado a su
 * propio módulo en Batch AA) y "medición por categoría" (Administración →
 * Categorías): ambas features nuevas piden agregar valores YA capturados
 * con una regla configurable. Mismo harness que `aplicacion.test.ts`
 * (llamada directa a `app.manejadores`, sin sesión — corre con el
 * `ContextoPermisos` "sin restricción"), y se siembran los `Resultado`
 * directo por repositorio (`app.infra.resultados.guardar`) para no
 * depender del flujo completo de Recolección (fecha de corte, etc.), que
 * es irrelevante para lo que este archivo verifica.
 */

let dataDir: string;
let app: AplicacionServidor;

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-medicion-test-'));
  app = await componerAplicacionServidor(dataDir);
  // Año inicial fijo (2020, con febrero bisiesto) — independiente de la fecha real de ejecución.
  const config = await app.manejadores['config:obtener']();
  await app.manejadores['config:guardar']({ ...config, anioInicial: 2020 });
});

afterEach(async () => {
  await app.cerrar();
  rmSync(dataDir, { recursive: true, force: true });
});

function indicadorBase(parcial: Partial<Indicador> = {}): Indicador {
  return {
    id: '', codigo: '', nombre: 'Indicador de prueba', definicion: 'Definición', formaCalculo: null,
    periodicidad: Periodicidad.Mensual, periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null,
    metaGlobal: null, desagregaciones: [], estado: 'Activo', responsable: null, categoria: null, equipo: null,
    unidadMedida: null, esCalculado: false, formula: null, requiereValidacion: true, creadoEn: '', actualizadoEn: '',
    ...parcial
  };
}

async function sembrarResultado(indicadorId: string, periodoId: string, valor: number): Promise<void> {
  const anio = Number(periodoId.split('-')[0]);
  const resultado: Resultado = {
    id: app.infra.ids.nuevoId(), indicadorId, periodoId, anio, claveDesagregacion: 'GENERAL', valor,
    observacion: null, estadoValidacion: 'Pendiente', validadoPor: null, validadoEn: null, comentarioValidacion: null,
    creadoEn: '2020-01-01T00:00:00.000Z', actualizadoEn: '2020-01-01T00:00:00.000Z'
  };
  await app.infra.resultados.guardar(resultado);
}

function corteBase(parcial: Partial<CorteMedicion> = {}): CorteMedicion {
  return {
    id: '', nombre: 'Corte', periodicidad: Periodicidad.Trimestral, reglaGeneral: 'promedio', reglasPorIndicador: {},
    // Desactivados por defecto EN LOS TESTS (a diferencia del default real de la UI, siempre true)
    // para no acoplar cada test a tener que sembrar Metas — cada toggle tiene su propio test dedicado.
    omitirPeriodosSinMeta: false, acotarAl100: false, creadoEn: '', actualizadoEn: '', ...parcial
  };
}

function metaPuntual(indicadorId: string, periodoId: string, valor: number): Meta {
  const anio = Number(periodoId.split('-')[0]);
  return {
    id: '', indicadorId, claveDesagregacion: 'GENERAL', valor, periodicidadMedicion: Periodicidad.Mensual,
    periodicidadPersonalizadaId: null, metodoCalculo: 'Promedio', anioVigencia: anio, periodoId, creadoEn: '', actualizadoEn: ''
  };
}

describe('ServicioCortesMedicion (Batch Y, rediseñado por periodicidad en Batch AA)', () => {
  it('agrupa los períodos de cada indicador en buckets según la periodicidad del corte, agregando cada uno con la regla general', async () => {
    const indicador = await app.manejadores['indicadores:guardar']({ indicador: indicadorBase({ nombre: 'Cobertura' }), valores: [] });
    await sembrarResultado(indicador.id, '2020-Mensual-01', 10);
    await sembrarResultado(indicador.id, '2020-Mensual-02', 20);
    await sembrarResultado(indicador.id, '2020-Mensual-03', 30);
    await sembrarResultado(indicador.id, '2020-Mensual-04', 5);
    await sembrarResultado(indicador.id, '2020-Mensual-05', 50);
    await sembrarResultado(indicador.id, '2020-Mensual-06', 15);

    const corte = await app.manejadores['cortesMedicion:guardar'](corteBase({ nombre: 'Trimestral', reglaGeneral: 'promedio' }));
    const resultados = await app.manejadores['cortesMedicion:calcular']({ id: corte.id });
    const filas = resultados.filter((r) => r.indicadorId === indicador.id);
    const q1 = filas.find((r) => r.periodoId === '2020-Trimestral-01');
    const q2 = filas.find((r) => r.periodoId === '2020-Trimestral-02');
    expect(q1?.valorAgregado).toBe(20); // (10+20+30)/3
    expect(q1?.periodosConsiderados).toBe(3);
    expect(q2?.valorAgregado).toBeCloseTo((5 + 50 + 15) / 3, 6);
    expect(q2?.periodosConsiderados).toBe(3);
  });

  it('una regla específica por indicador reemplaza a la regla general SOLO para ese indicador', async () => {
    const a = await app.manejadores['indicadores:guardar']({ indicador: indicadorBase({ nombre: 'A' }), valores: [] });
    const b = await app.manejadores['indicadores:guardar']({ indicador: indicadorBase({ nombre: 'B' }), valores: [] });
    await sembrarResultado(a.id, '2020-Mensual-01', 10);
    await sembrarResultado(a.id, '2020-Mensual-02', 30);
    await sembrarResultado(b.id, '2020-Mensual-01', 10);
    await sembrarResultado(b.id, '2020-Mensual-02', 30);

    const corte = await app.manejadores['cortesMedicion:guardar'](
      corteBase({ nombre: 'Corte', reglaGeneral: 'promedio', reglasPorIndicador: { [a.id]: 'maximo' } })
    );
    const resultados = await app.manejadores['cortesMedicion:calcular']({ id: corte.id });
    const q1A = resultados.find((r) => r.indicadorId === a.id && r.periodoId === '2020-Trimestral-01');
    const q1B = resultados.find((r) => r.indicadorId === b.id && r.periodoId === '2020-Trimestral-01');
    expect(q1A?.valorAgregado).toBe(30); // máximo (override)
    expect(q1B?.valorAgregado).toBe(20); // promedio (general)
  });

  it('omitirPeriodosSinMeta excluye del bucket los períodos sin Meta configurada (default true en la UI)', async () => {
    const indicador = await app.manejadores['indicadores:guardar']({ indicador: indicadorBase({ nombre: 'Con metas' }), valores: [] });
    await sembrarResultado(indicador.id, '2020-Mensual-01', 10);
    await sembrarResultado(indicador.id, '2020-Mensual-02', 20);
    await sembrarResultado(indicador.id, '2020-Mensual-03', 30); // sin Meta — se excluye
    await app.manejadores['metas:guardar'](metaPuntual(indicador.id, '2020-Mensual-01', 100));
    await app.manejadores['metas:guardar'](metaPuntual(indicador.id, '2020-Mensual-02', 100));

    const corte = await app.manejadores['cortesMedicion:guardar'](corteBase({ nombre: 'Con omitir', omitirPeriodosSinMeta: true }));
    const resultados = await app.manejadores['cortesMedicion:calcular']({ id: corte.id });
    const q1 = resultados.find((r) => r.indicadorId === indicador.id && r.periodoId === '2020-Trimestral-01');
    expect(q1?.periodosConsiderados).toBe(2); // marzo excluido, sin Meta
    expect(q1?.valorAgregado).toBe(15); // (10+20)/2
  });

  it('acotarAl100 acota el valor agregado final de cada bucket a un máximo de 100', async () => {
    const indicador = await app.manejadores['indicadores:guardar']({ indicador: indicadorBase({ nombre: 'Sobre 100' }), valores: [] });
    await sembrarResultado(indicador.id, '2020-Mensual-01', 120);
    await sembrarResultado(indicador.id, '2020-Mensual-02', 150);

    const corte = await app.manejadores['cortesMedicion:guardar'](corteBase({ nombre: 'Acotado', reglaGeneral: 'maximo', acotarAl100: true }));
    const resultados = await app.manejadores['cortesMedicion:calcular']({ id: corte.id });
    const q1 = resultados.find((r) => r.indicadorId === indicador.id && r.periodoId === '2020-Trimestral-01');
    expect(q1?.valorAgregado).toBe(100);
  });

  it('rechaza guardar con nombre duplicado, regla inválida o periodicidad inválida (Mensual no es un corte válido)', async () => {
    await app.manejadores['cortesMedicion:guardar'](corteBase({ nombre: 'Único' }));

    const duplicado = await app.manejadores['cortesMedicion:guardar'](corteBase({ nombre: 'Único' })).catch((e) => e);
    expect((duplicado as Error & { detalles?: string[] }).detalles?.join(' ')).toMatch(/nombre/);

    const reglaInvalida = await app.manejadores['cortesMedicion:guardar'](
      corteBase({ nombre: 'Otro', reglaGeneral: 'inventada' as CorteMedicion['reglaGeneral'] })
    ).catch((e) => e);
    expect((reglaInvalida as Error & { detalles?: string[] }).detalles?.join(' ')).toMatch(/regla/);

    const periodicidadInvalida = await app.manejadores['cortesMedicion:guardar'](
      corteBase({ nombre: 'Otro más', periodicidad: Periodicidad.Mensual })
    ).catch((e) => e);
    expect((periodicidadInvalida as Error & { detalles?: string[] }).detalles?.join(' ')).toMatch(/periodicidad/);
  });
});

describe('ServicioMedicionCategoria (Batch Y)', () => {
  async function categoriaConDosIndicadores(): Promise<{ categoria: Categoria; a: Indicador; b: Indicador }> {
    const categoria = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Salud', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null,
      creadoEn: '', actualizadoEn: ''
    });
    const a = await app.manejadores['indicadores:guardar']({ indicador: indicadorBase({ nombre: 'A', categoria: categoria.id }), valores: [] });
    const b = await app.manejadores['indicadores:guardar']({ indicador: indicadorBase({ nombre: 'B', categoria: categoria.id }), valores: [] });
    await sembrarResultado(a.id, '2020-Mensual-01', 10);
    await sembrarResultado(b.id, '2020-Mensual-01', 30);
    return { categoria, a, b };
  }

  it('sin configuración guardada, usa el default (promedio, sin excepciones)', async () => {
    const { categoria } = await categoriaConDosIndicadores();
    const resultado = await app.manejadores['medicionCategoria:calcular']({ categoriaId: categoria.id, periodoId: '2020-Mensual-01' });
    expect(resultado.regla).toBe('promedio');
    expect(resultado.valorAgregado).toBe(20);
    expect(resultado.indicadoresConsiderados).toBe(2);
  });

  it('"excluir" saca a ese indicador del cálculo', async () => {
    const { categoria, a } = await categoriaConDosIndicadores();
    await app.manejadores['medicionCategoria:guardar']({
      categoriaId: categoria.id, reglaGeneral: 'promedio', tratamientoIndicadores: { [a.id]: { excluir: true } }, actualizadoEn: ''
    });
    const resultado = await app.manejadores['medicionCategoria:calcular']({ categoriaId: categoria.id, periodoId: '2020-Mensual-01' });
    expect(resultado.valorAgregado).toBe(30); // solo B
    expect(resultado.indicadoresConsiderados).toBe(1);
  });

  it('un peso mayor da más influencia a ese indicador en el promedio', async () => {
    const { categoria, a } = await categoriaConDosIndicadores();
    await app.manejadores['medicionCategoria:guardar']({
      categoriaId: categoria.id, reglaGeneral: 'promedio', tratamientoIndicadores: { [a.id]: { peso: 3 } }, actualizadoEn: ''
    });
    // (10*3 + 30*1) / (3+1) = 60/4 = 15
    const resultado = await app.manejadores['medicionCategoria:calcular']({ categoriaId: categoria.id, periodoId: '2020-Mensual-01' });
    expect(resultado.valorAgregado).toBe(15);
  });
});
