import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { componerAplicacion } from '../../src/main/composicion';
import type { Aplicacion } from '../../src/main/composicion';
import { Periodicidad } from '@domain/index';
import type { DefinicionPeriodicidad, Indicador, ReglaNegocio } from '@domain/index';

let dataDir: string;
let app: Aplicacion;

function indicador(parcial: Partial<Indicador> = {}): Indicador {
  return {
    id: '', nombre: 'Indicador de prueba', definicion: 'Definición', periodicidad: Periodicidad.Trimestral,
    periodicidadPersonalizadaId: null, lineaBase: null, metaGlobal: null, desagregaciones: [],
    estado: 'Activo', responsable: null, categoria: null, unidadMedida: null,
    creadoEn: '', actualizadoEn: '',
    ...parcial
  };
}

function reglaValidacionCruzada(parcial: Partial<ReglaNegocio> & { condicion: ReglaNegocio['condicion'] }): ReglaNegocio {
  return {
    id: '', nombre: 'Regla', descripcion: '', tipo: 'ValidacionCruzada', entidad: 'Indicador',
    atributoObjetivoId: null, mensajeError: null, activa: true, creadoEn: '', actualizadoEn: '',
    ...parcial
  };
}

beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'kpitracker-app-test-'));
  app = await componerAplicacion(dataDir);
});

afterEach(async () => {
  await app.cerrar();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('Composition root — validación cruzada al guardar indicadores', () => {
  it('rechaza guardar un indicador que incumple una regla ValidacionCruzada, con el mensaje configurado', async () => {
    await app.manejadores['reglas:guardar'](
      reglaValidacionCruzada({
        nombre: 'Línea base bajo meta',
        mensajeError: 'La línea base debe ser menor que la meta global.',
        condicion: { op: 'lt', args: [{ attr: 'LineaBase' }, { attr: 'MetaGlobal' }] }
      })
    );

    const invalido = indicador({ lineaBase: 90, metaGlobal: 50 });
    await expect(app.manejadores['indicadores:guardar']({ indicador: invalido, valores: [] })).rejects.toThrow(
      /no cumple una o más reglas/
    );

    try {
      await app.manejadores['indicadores:guardar']({ indicador: invalido, valores: [] });
      throw new Error('no debió llegar aquí');
    } catch (error) {
      const detalles = (error as Error & { detalles?: string[] }).detalles;
      expect(detalles).toContain('La línea base debe ser menor que la meta global.');
    }

    const valido = indicador({ lineaBase: 50, metaGlobal: 90 });
    const guardado = await app.manejadores['indicadores:guardar']({ indicador: valido, valores: [] });
    expect(guardado.id).not.toBe('');
  });

  it('no persiste el indicador ni sus valores EAV cuando la validación falla', async () => {
    await app.manejadores['reglas:guardar'](
      reglaValidacionCruzada({ condicion: { op: 'lt', args: [{ attr: 'LineaBase' }, { attr: 'MetaGlobal' }] } })
    );
    const invalido = indicador({ nombre: 'No debe quedar guardado', lineaBase: 90, metaGlobal: 50 });
    await expect(app.manejadores['indicadores:guardar']({ indicador: invalido, valores: [] })).rejects.toThrow();
    const lista = await app.manejadores['indicadores:listar'](undefined);
    expect(lista.find((i) => i.nombre === 'No debe quedar guardado')).toBeUndefined();
  });
});

describe('Composition root — catálogos', () => {
  it('CRUD de periodicidades personalizadas vía IPC', async () => {
    const definicion: DefinicionPeriodicidad = {
      id: '', nombre: 'Semestres personalizados', descripcion: '',
      cortes: [
        { numero: 1, etiqueta: 'Primer semestre', mesInicio: 1, mesFin: 6 },
        { numero: 2, etiqueta: 'Segundo semestre', mesInicio: 7, mesFin: 12 }
      ],
      creadoEn: '', actualizadoEn: ''
    };
    const guardada = await app.manejadores['periodicidades:guardar'](definicion);
    expect(guardada.id).not.toBe('');
    expect(await app.manejadores['periodicidades:listar'](undefined)).toHaveLength(1);
    await app.manejadores['periodicidades:eliminar']({ id: guardada.id });
    expect(await app.manejadores['periodicidades:listar'](undefined)).toHaveLength(0);
  });

  it('rechaza una definición de periodicidad con huecos', async () => {
    const definicion: DefinicionPeriodicidad = {
      id: '', nombre: 'Inválida', descripcion: '',
      cortes: [{ numero: 1, etiqueta: 'Solo enero-marzo', mesInicio: 1, mesFin: 3 }],
      creadoEn: '', actualizadoEn: ''
    };
    await expect(app.manejadores['periodicidades:guardar'](definicion)).rejects.toThrow();
  });

  it('CRUD de responsables y categorías vía IPC', async () => {
    const responsable = await app.manejadores['responsables:guardar']({
      id: '', nombre: 'Juan Pérez', correo: 'juan@example.org', activo: true, creadoEn: '', actualizadoEn: ''
    });
    const categoria = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Estratégico', descripcion: '', activo: true, creadoEn: '', actualizadoEn: ''
    });
    expect(await app.manejadores['responsables:listar'](undefined)).toHaveLength(1);
    expect(await app.manejadores['categorias:listar'](undefined)).toHaveLength(1);
    await app.manejadores['responsables:eliminar']({ id: responsable.id });
    await app.manejadores['categorias:eliminar']({ id: categoria.id });
    expect(await app.manejadores['responsables:listar'](undefined)).toHaveLength(0);
    expect(await app.manejadores['categorias:listar'](undefined)).toHaveLength(0);
  });
});

describe('Composition root — periodicidad personalizada en Recolección', () => {
  it('genera períodos y permite capturar según los cortes definidos por el usuario', async () => {
    const definicion = await app.manejadores['periodicidades:guardar']({
      id: '', nombre: 'Semestres', descripcion: '',
      cortes: [
        { numero: 1, etiqueta: 'Primer semestre', mesInicio: 1, mesFin: 6 },
        { numero: 2, etiqueta: 'Segundo semestre', mesInicio: 7, mesFin: 12 }
      ],
      creadoEn: '', actualizadoEn: ''
    });
    const config = await app.manejadores['config:obtener'](undefined);
    await app.manejadores['config:guardar']({ ...config, anioInicial: new Date().getFullYear() });

    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ periodicidad: Periodicidad.Personalizada, periodicidadPersonalizadaId: definicion.id }),
      valores: []
    });

    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    // El primer semestre del año en curso siempre ya inició, sin importar la fecha actual.
    expect(periodos.length).toBeGreaterThanOrEqual(1);
    expect(periodos[0]?.etiqueta).toContain('Primer semestre');
    expect(periodos[0]?.id).toMatch(/-Personalizada-01$/);

    const captura = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId: periodos[0]!.id });
    expect(captura.periodoEtiqueta).toContain('Primer semestre');

    const resultado = await app.manejadores['recoleccion:guardarCelda']({
      indicadorId: guardado.id, periodoId: periodos[0]!.id, claveDesagregacion: 'GENERAL', valorCrudo: '42'
    });
    expect(resultado.valor).toBe(42);
  });
});

describe('Composition root — advertencias de validación cruzada en Recolección', () => {
  it('advierte cuando el resultado General es menor que el máximo de sus desagregaciones', async () => {
    const lista = await app.manejadores['listas:guardar']({
      id: '', nombre: 'Sexo', descripcion: '', estado: 'Activa', version: 1, orden: 1, jerarquica: false, creadoEn: '', actualizadoEn: ''
    });
    await app.manejadores['listas:guardarElemento']({ id: '', listaId: lista.id, codigo: 'M', descripcion: 'Masculino', orden: 1, padreCodigo: null, activo: true });

    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ desagregaciones: [lista.id] }),
      valores: []
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;

    await app.manejadores['recoleccion:guardarCelda']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '30' });
    const respuesta = await app.manejadores['recoleccion:guardarCelda']({
      indicadorId: guardado.id, periodoId, claveDesagregacion: `${lista.id}=M`, valorCrudo: '80'
    });

    expect(respuesta.advertencias.some((a) => a.includes('menor que el máximo'))).toBe(true);

    const captura = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId });
    expect(captura.advertencias.some((a) => a.includes('menor que el máximo'))).toBe(true);
  });
});

describe('Composition root — configuración portable v1 → v2', () => {
  it('migra un archivo v1 auténtico (sin las secciones nuevas) e importa correctamente', async () => {
    const archivoV1 = {
      formato: 'kpitracker-config',
      schemaVersion: 1,
      exportadoEn: new Date().toISOString(),
      configuracionGeneral: { anioInicial: 2024, reglaFechaLimite: { tipo: 'DiaFijoDelMes', parametros: { dia: 10 } }, exportarCsv: false, nombreInstitucion: 'Institución v1', tema: 'sistema', schemaVersion: 1 },
      indicadores: [],
      atributos: [],
      listas: [],
      elementos: [],
      reglas: [],
      metas: []
      // Nótese: sin periodicidades/responsables/categorias — así lucía un archivo real de la v1.
    };

    const { advertencias } = await app.manejadores['portable:importar']({ json: JSON.stringify(archivoV1) });
    expect(advertencias.some((a) => a.includes('versión 2'))).toBe(true);

    const config = await app.manejadores['config:obtener'](undefined);
    expect(config.nombreInstitucion).toBe('Institución v1');
    // La importación no debe fallar aunque falten las secciones nuevas.
    expect(await app.manejadores['periodicidades:listar'](undefined)).toHaveLength(0);
  });
});

describe('Composition root — exportación analítica resuelve nombres de catálogo', () => {
  it('ResultadosAnalitico.parquet muestra el nombre del responsable y la categoría, no sus ids', async () => {
    const responsable = await app.manejadores['responsables:guardar']({
      id: '', nombre: 'María Gómez', correo: null, activo: true, creadoEn: '', actualizadoEn: ''
    });
    const categoria = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Prioritario', descripcion: '', activo: true, creadoEn: '', actualizadoEn: ''
    });
    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ responsable: responsable.id, categoria: categoria.id }),
      valores: []
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await app.manejadores['recoleccion:guardarCelda']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10' });

    await app.infra.exportacion.regenerar();

    const rutaExport = join(dataDir, 'Export', 'ResultadosAnalitico.parquet');
    expect(existsSync(rutaExport)).toBe(true);
    const filas = await app.infra.db.all<{ responsable: string; categoria: string }>(
      `SELECT responsable, categoria FROM read_parquet('${rutaExport.replace(/'/g, "''")}')`
    );
    expect(filas[0]?.responsable).toBe('María Gómez');
    expect(filas[0]?.categoria).toBe('Prioritario');
  });
});
