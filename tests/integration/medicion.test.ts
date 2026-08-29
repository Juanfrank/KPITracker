import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { componerAplicacionServidor } from '../../src/server/composicionServidor';
import type { AplicacionServidor } from '../../src/server/composicionServidor';
import { Periodicidad } from '@domain/index';
import type { Categoria, CorteMedicion, Indicador, Resultado } from '@domain/index';

/**
 * Batch Y — "Cortes de medición" (Configuración de Metas) y "medición por
 * categoría" (Administración → Categorías): ambas features nuevas piden
 * agregar valores YA capturados con una regla configurable. Mismo harness
 * que `aplicacion.test.ts` (llamada directa a `app.manejadores`, sin sesión
 * — corre con el `ContextoPermisos` "sin restricción"), y se siembran los
 * `Resultado` directo por repositorio (`app.infra.resultados.guardar`) para
 * no depender del flujo completo de Recolección (fecha de corte, etc.), que
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
  return { id: '', nombre: 'Corte', fecha: '', reglaGeneral: 'promedio', reglasPorIndicador: {}, creadoEn: '', actualizadoEn: '', ...parcial };
}

describe('ServicioCortesMedicion (Batch Y)', () => {
  it('agrega los períodos cerrados de cada indicador desde el corte anterior hasta este, con la regla general', async () => {
    const indicador = await app.manejadores['indicadores:guardar']({ indicador: indicadorBase({ nombre: 'Cobertura' }), valores: [] });
    await sembrarResultado(indicador.id, '2020-Mensual-01', 10);
    await sembrarResultado(indicador.id, '2020-Mensual-02', 20);
    await sembrarResultado(indicador.id, '2020-Mensual-03', 30);

    const corteQ1 = await app.manejadores['cortesMedicion:guardar'](corteBase({ nombre: 'Q1 2020', fecha: '2020-03-31', reglaGeneral: 'promedio' }));
    const resultadosQ1 = await app.manejadores['cortesMedicion:calcular']({ id: corteQ1.id });
    const filaQ1 = resultadosQ1.find((r) => r.indicadorId === indicador.id);
    expect(filaQ1?.valorAgregado).toBe(20);
    expect(filaQ1?.periodosConsiderados).toBe(3);

    // Segundo corte, posterior: solo agrega lo capturado DESPUÉS del corte anterior.
    await sembrarResultado(indicador.id, '2020-Mensual-04', 5);
    await sembrarResultado(indicador.id, '2020-Mensual-05', 50);
    await sembrarResultado(indicador.id, '2020-Mensual-06', 15);
    const corteQ2 = await app.manejadores['cortesMedicion:guardar'](corteBase({ nombre: 'Q2 2020', fecha: '2020-06-30', reglaGeneral: 'maximo' }));
    const resultadosQ2 = await app.manejadores['cortesMedicion:calcular']({ id: corteQ2.id });
    const filaQ2 = resultadosQ2.find((r) => r.indicadorId === indicador.id);
    expect(filaQ2?.valorAgregado).toBe(50);
    expect(filaQ2?.periodosConsiderados).toBe(3);
  });

  it('una regla específica por indicador reemplaza a la regla general SOLO para ese indicador', async () => {
    const a = await app.manejadores['indicadores:guardar']({ indicador: indicadorBase({ nombre: 'A' }), valores: [] });
    const b = await app.manejadores['indicadores:guardar']({ indicador: indicadorBase({ nombre: 'B' }), valores: [] });
    await sembrarResultado(a.id, '2020-Mensual-01', 10);
    await sembrarResultado(a.id, '2020-Mensual-02', 30);
    await sembrarResultado(b.id, '2020-Mensual-01', 10);
    await sembrarResultado(b.id, '2020-Mensual-02', 30);

    const corte = await app.manejadores['cortesMedicion:guardar'](
      corteBase({ nombre: 'Corte', fecha: '2020-02-29', reglaGeneral: 'promedio', reglasPorIndicador: { [a.id]: 'maximo' } })
    );
    const resultados = await app.manejadores['cortesMedicion:calcular']({ id: corte.id });
    expect(resultados.find((r) => r.indicadorId === a.id)?.valorAgregado).toBe(30); // máximo (override)
    expect(resultados.find((r) => r.indicadorId === b.id)?.valorAgregado).toBe(20); // promedio (general)
  });

  it('rechaza guardar con nombre duplicado o regla inválida', async () => {
    await app.manejadores['cortesMedicion:guardar'](corteBase({ nombre: 'Único', fecha: '2020-01-31' }));

    const duplicado = await app.manejadores['cortesMedicion:guardar'](corteBase({ nombre: 'Único', fecha: '2020-02-29' })).catch((e) => e);
    expect((duplicado as Error & { detalles?: string[] }).detalles?.join(' ')).toMatch(/nombre/);

    const reglaInvalida = await app.manejadores['cortesMedicion:guardar'](
      corteBase({ nombre: 'Otro', fecha: '2020-01-31', reglaGeneral: 'inventada' as CorteMedicion['reglaGeneral'] })
    ).catch((e) => e);
    expect((reglaInvalida as Error & { detalles?: string[] }).detalles?.join(' ')).toMatch(/regla/);
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
