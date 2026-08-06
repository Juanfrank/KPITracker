import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { componerAplicacion } from '../../src/main/composicion';
import type { Aplicacion } from '../../src/main/composicion';
import { Periodicidad, TipoDato } from '@domain/index';
import type { DefinicionPeriodicidad, Indicador, Meta, ReglaNegocio } from '@domain/index';

let dataDir: string;
let app: Aplicacion;

function indicador(parcial: Partial<Indicador> = {}): Indicador {
  return {
    id: '', codigo: '', nombre: 'Indicador de prueba', definicion: 'Definición', formaCalculo: null, periodicidad: Periodicidad.Trimestral,
    periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null, metaGlobal: null, desagregaciones: [],
    estado: 'Activo', responsable: null, categoria: null, unidadMedida: null, esCalculado: false, formula: null,
    creadoEn: '', actualizadoEn: '',
    ...parcial
  };
}

function reglaValidacionCruzada(parcial: Partial<ReglaNegocio> & { condicion: ReglaNegocio['condicion'] }): ReglaNegocio {
  return {
    id: '', nombre: 'Regla', descripcion: '', tipo: 'ValidacionCruzada', entidad: 'Indicador',
    atributoObjetivoId: null, mensajeError: null, activa: true, eliminado: false, creadoEn: '', actualizadoEn: '',
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
      id: '', nombre: 'Juan Pérez', correo: 'juan@example.org', activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    const categoria = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Estratégico', descripcion: '', activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
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

    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId: periodos[0]!.id, fechaCorte: '2025-06-30' });
    const resultado = await app.manejadores['recoleccion:guardarCelda']({
      indicadorId: guardado.id, periodoId: periodos[0]!.id, claveDesagregacion: 'GENERAL', valorCrudo: '42'
    });
    expect(resultado.valor).toBe(42);
  });
});

describe('Composition root — advertencias de validación cruzada en Recolección', () => {
  it('advierte cuando el resultado General es menor que el máximo de sus desagregaciones', async () => {
    const lista = await app.manejadores['listas:guardar']({
      id: '', nombre: 'Sexo', descripcion: '', prefijo: 'SEXO', estado: 'Activa', version: 1, orden: 1, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    await app.manejadores['listas:guardarElemento']({ id: '', listaId: lista.id, codigo: 'M', nombre: 'Masculino', descripcion: '', orden: 1, padreCodigo: null, activo: true });

    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ desagregaciones: [lista.id] }),
      valores: []
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;

    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });
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
      id: '', nombre: 'María Gómez', correo: null, activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    const categoria = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Prioritario', descripcion: '', activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ responsable: responsable.id, categoria: categoria.id }),
      valores: []
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });
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

describe('Composition root — código único de indicador', () => {
  it('rechaza guardar dos indicadores con el mismo código', async () => {
    await app.manejadores['indicadores:guardar']({ indicador: indicador({ codigo: 'IND-001' }), valores: [] });
    try {
      await app.manejadores['indicadores:guardar']({ indicador: indicador({ codigo: 'IND-001' }), valores: [] });
      throw new Error('no debió llegar aquí');
    } catch (error) {
      const detalles = (error as Error & { detalles?: string[] }).detalles;
      expect(detalles?.some((d) => d.includes('código'))).toBe(true);
    }
  });

  it('permite guardar indicadores sin código (no es obligatorio)', async () => {
    const a = await app.manejadores['indicadores:guardar']({ indicador: indicador({ codigo: '' }), valores: [] });
    const b = await app.manejadores['indicadores:guardar']({ indicador: indicador({ codigo: '' }), valores: [] });
    expect(a.id).not.toBe(b.id);
  });

  it('permite conservar el mismo código al editar el propio indicador', async () => {
    const creado = await app.manejadores['indicadores:guardar']({ indicador: indicador({ codigo: 'IND-002' }), valores: [] });
    const editado = await app.manejadores['indicadores:guardar']({
      indicador: { ...creado, nombre: 'Renombrado' }, valores: []
    });
    expect(editado.codigo).toBe('IND-002');
  });
});

describe('Composition root — reasignación masiva de responsable/categoría', () => {
  it('reasigna responsable y categoría a varios indicadores sin tocar los campos no especificados', async () => {
    const responsable = await app.manejadores['responsables:guardar']({
      id: '', nombre: 'Ana', correo: null, activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    const categoriaOriginal = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Original', descripcion: '', activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    const i1 = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ categoria: categoriaOriginal.id }), valores: []
    });
    const i2 = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });

    await app.manejadores['indicadores:reasignarMasivo']({ ids: [i1.id, i2.id], responsable: responsable.id });

    const lista = await app.manejadores['indicadores:listar'](undefined);
    const i1Actualizado = lista.find((i) => i.id === i1.id);
    const i2Actualizado = lista.find((i) => i.id === i2.id);
    expect(i1Actualizado?.responsable).toBe(responsable.id);
    expect(i1Actualizado?.categoria).toBe(categoriaOriginal.id); // no se tocó
    expect(i2Actualizado?.responsable).toBe(responsable.id);
  });

  it('permite quitar una asignación pasando null explícitamente', async () => {
    const responsable = await app.manejadores['responsables:guardar']({
      id: '', nombre: 'Beto', correo: null, activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    const i1 = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ responsable: responsable.id }), valores: []
    });
    await app.manejadores['indicadores:reasignarMasivo']({ ids: [i1.id], responsable: null });
    const lista = await app.manejadores['indicadores:listar'](undefined);
    expect(lista.find((i) => i.id === i1.id)?.responsable).toBeNull();
  });
});

describe('Composition root — importación de indicadores desde Excel', () => {
  it('crea indicadores a partir de filas mapeadas y reporta errores por fila sin bloquear el resto', async () => {
    const filas = [
      { Codigo: 'IND-100', Titulo: 'Indicador importado 1', Desc: 'Definición 1' },
      { Codigo: 'IND-101', Titulo: '', Desc: 'Sin nombre, debe fallar' },
      { Codigo: 'IND-102', Titulo: 'Indicador importado 2', Desc: 'Definición 2' }
    ];
    const resultado = await app.manejadores['indicadores:importarExcel']({
      filas,
      mapeo: { codigo: 'Codigo', nombre: 'Titulo', definicion: 'Desc' }
    });
    expect(resultado.creados).toBe(2);
    expect(resultado.errores).toHaveLength(1);
    expect(resultado.errores[0]?.fila).toBe(3); // fila 2 del array (0-based) + 2 = fila 3

    const lista = await app.manejadores['indicadores:listar'](undefined);
    expect(lista.some((i) => i.codigo === 'IND-100')).toBe(true);
    expect(lista.some((i) => i.codigo === 'IND-102')).toBe(true);
    expect(lista.find((i) => i.codigo === 'IND-100')?.estado).toBe('Borrador');
  });
});

describe('Composition root — metas con periodicidad personalizada', () => {
  const meta = (parcial: Partial<Meta> = {}): Meta => ({
    id: '', indicadorId: '', claveDesagregacion: 'GENERAL', valor: 100,
    periodicidadMedicion: Periodicidad.Anual, periodicidadPersonalizadaId: null,
    metodoCalculo: 'Promedio', anioVigencia: 2025, creadoEn: '', actualizadoEn: '',
    ...parcial
  });

  it('rechaza una meta Personalizada sin definición seleccionada', async () => {
    const ind = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    await expect(
      app.manejadores['metas:guardar'](meta({ indicadorId: ind.id, periodicidadMedicion: Periodicidad.Personalizada }))
    ).rejects.toThrow(/periodicidad personalizada/);
  });

  it('acepta una meta Personalizada con una definición existente', async () => {
    const definicion = await app.manejadores['periodicidades:guardar']({
      id: '', nombre: 'Trimestres', descripcion: '',
      cortes: [
        { numero: 1, etiqueta: 'T1', mesInicio: 1, mesFin: 3 }, { numero: 2, etiqueta: 'T2', mesInicio: 4, mesFin: 6 },
        { numero: 3, etiqueta: 'T3', mesInicio: 7, mesFin: 9 }, { numero: 4, etiqueta: 'T4', mesInicio: 10, mesFin: 12 }
      ],
      creadoEn: '', actualizadoEn: ''
    });
    const ind = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    const guardada = await app.manejadores['metas:guardar'](
      meta({ indicadorId: ind.id, periodicidadMedicion: Periodicidad.Personalizada, periodicidadPersonalizadaId: definicion.id })
    );
    expect(guardada.id).not.toBe('');
  });
});

describe('Composition root — versionado de resultados y rollback', () => {
  it('registra versiones anteriores al sobrescribir una celda y permite restaurar', async () => {
    const guardado = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });

    await app.manejadores['recoleccion:guardarCelda']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10' });
    await app.manejadores['recoleccion:guardarCelda']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '20' });
    await app.manejadores['recoleccion:guardarCelda']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '30' });

    const historial = await app.manejadores['recoleccion:historial']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL' });
    // Dos versiones anteriores quedaron registradas (10 y 20); 30 es el valor vigente, no está en el historial.
    expect(historial).toHaveLength(2);
    expect(historial.map((h) => h.valor).sort()).toEqual([10, 20]);

    const version1 = historial.find((h) => h.valor === 10)!;
    const restaurado = await app.manejadores['recoleccion:restaurarVersion']({
      indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', version: version1.version
    });
    expect(restaurado.valor).toBe(10);

    // El valor vigente ahora es 10; el 30 que reemplazó queda preservado como nueva versión del historial.
    const historialTrasRestaurar = await app.manejadores['recoleccion:historial']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL' });
    expect(historialTrasRestaurar.map((h) => h.valor).sort()).toEqual([10, 20, 30]);

    const captura = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId });
    expect(captura.filas.find((f) => f.claveDesagregacion === 'GENERAL')?.valor).toBe(10);
  });
});

describe('Composition root — indicadores calculados (fórmulas)', () => {
  it('calcula el valor a partir de otros indicadores y rechaza la captura manual', async () => {
    const base = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ codigo: 'BASE-1' }), valores: []
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: base.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: base.id, periodoId, fechaCorte: '2025-01-31' });
    await app.manejadores['recoleccion:guardarCelda']({ indicadorId: base.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10' });

    const calculado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ codigo: 'CALC-1', esCalculado: true, formula: '[BASE-1] * 2' }), valores: []
    });

    const captura = await app.manejadores['recoleccion:captura']({ indicadorId: calculado.id, periodoId });
    expect(captura.filas[0]?.valor).toBe(20);

    await expect(
      app.manejadores['recoleccion:guardarCelda']({ indicadorId: calculado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '999' })
    ).rejects.toThrow(/calculado/);
  });

  it('rechaza una fórmula que crea una referencia circular', async () => {
    await app.manejadores['indicadores:guardar']({
      indicador: indicador({ codigo: 'X', esCalculado: true, formula: '[Y] + 1' }), valores: []
    });
    try {
      await app.manejadores['indicadores:guardar']({
        indicador: indicador({ codigo: 'Y', esCalculado: true, formula: '[X] + 1' }), valores: []
      });
      throw new Error('no debió llegar aquí');
    } catch (error) {
      const detalles = (error as Error & { detalles?: string[] }).detalles;
      expect(detalles?.some((d) => d.includes('circular'))).toBe(true);
    }
  });

  it('rechaza una fórmula con sintaxis inválida', async () => {
    await expect(
      app.manejadores['indicadores:guardar']({
        indicador: indicador({ codigo: 'Z', esCalculado: true, formula: '[A] +' }), valores: []
      })
    ).rejects.toThrow();
  });
});

describe('Composition root — captura bloqueada sin fecha de corte', () => {
  it('rechaza guardar una celda si el levantamiento no tiene fecha de corte', async () => {
    const guardado = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await expect(
      app.manejadores['recoleccion:guardarCelda']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10' })
    ).rejects.toThrow(/fecha de corte/);
  });

  it('permite capturar una vez establecida la fecha de corte', async () => {
    const guardado = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });
    const resultado = await app.manejadores['recoleccion:guardarCelda']({
      indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10'
    });
    expect(resultado.valor).toBe(10);
  });
});

describe('Composition root — comentario del levantamiento', () => {
  it('guarda y expone el comentario a nivel indicador+período', async () => {
    const guardado = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await app.manejadores['recoleccion:comentario']({ indicadorId: guardado.id, periodoId, comentario: 'Pendiente de validar con el área.' });
    const captura = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId });
    expect(captura.comentario).toBe('Pendiente de validar con el área.');
  });
});

describe('Composition root — prefijo de lista y nombre de elemento', () => {
  it('rechaza un prefijo vacío o con caracteres no alfabéticos', async () => {
    const base = { id: '', nombre: 'Sexo', descripcion: '', estado: 'Activa' as const, version: 1, orden: 1, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: '' };
    await expect(app.manejadores['listas:guardar']({ ...base, prefijo: '' })).rejects.toThrow(/prefijo/);
    await expect(app.manejadores['listas:guardar']({ ...base, prefijo: 'SEXO-1' })).rejects.toThrow(/alfabético/);
    await expect(app.manejadores['listas:guardar']({ ...base, prefijo: 'SEXO 1' })).rejects.toThrow(/alfabético/);
  });

  it('normaliza un prefijo en minúsculas a mayúsculas', async () => {
    const guardada = await app.manejadores['listas:guardar']({
      id: '', nombre: 'Sexo', descripcion: '', prefijo: 'sexo', estado: 'Activa', version: 1, orden: 1, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    expect(guardada.prefijo).toBe('SEXO');
  });

  it('rechaza dos listas con el mismo prefijo', async () => {
    const base = { id: '', descripcion: '', estado: 'Activa' as const, version: 1, orden: 1, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: '' };
    await app.manejadores['listas:guardar']({ ...base, nombre: 'Sexo', prefijo: 'SEXO' });
    await expect(app.manejadores['listas:guardar']({ ...base, nombre: 'Sexo 2', prefijo: 'SEXO' })).rejects.toThrow(/prefijo/);
  });

  it('autogenera el código del elemento a partir del prefijo y exige nombre', async () => {
    const lista = await app.manejadores['listas:guardar']({
      id: '', nombre: 'Sexo', descripcion: '', prefijo: 'SEXO', estado: 'Activa', version: 1, orden: 1, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    await expect(
      app.manejadores['listas:guardarElemento']({ id: '', listaId: lista.id, codigo: `${lista.prefijo}-01`, nombre: '', descripcion: '', orden: 1, padreCodigo: null, activo: true })
    ).rejects.toThrow(/nombre/);
    const elemento = await app.manejadores['listas:guardarElemento']({
      id: '', listaId: lista.id, codigo: `${lista.prefijo}-01`, nombre: 'Masculino', descripcion: '', orden: 1, padreCodigo: null, activo: true
    });
    expect(elemento.codigo).toBe('SEXO-01');
    expect(elemento.nombre).toBe('Masculino');
  });
});

describe('Composition root — forma de cálculo del indicador', () => {
  it('acepta texto sin notación matemática', async () => {
    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ formaCalculo: 'Se calcula mediante inspección directa del expediente.' }), valores: []
    });
    expect(guardado.formaCalculo).toContain('inspección');
  });

  it('acepta una expresión con signos de agrupación balanceados', async () => {
    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ formaCalculo: '(Casos resueltos / Casos totales) * 100' }), valores: []
    });
    expect(guardado.formaCalculo).toContain('100');
  });

  it('rechaza una expresión con signos de agrupación desbalanceados', async () => {
    try {
      await app.manejadores['indicadores:guardar']({
        indicador: indicador({ formaCalculo: '(Casos resueltos / Casos totales * 100' }), valores: []
      });
      throw new Error('no debió llegar aquí');
    } catch (error) {
      const detalles = (error as Error & { detalles?: string[] }).detalles;
      expect(detalles?.some((d) => d.includes('agrupación'))).toBe(true);
    }
  });
});

describe('Composition root — histórico de resultados en Seguimiento', () => {
  it('expone el valor y el cumplimiento de meta por período', async () => {
    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ metaGlobal: 100 }), valores: []
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const hoy = new Date().toISOString().slice(0, 10);
    const periodoId = periodos.slice().reverse().find((p) => p.fechaFin < hoy)!.id;
    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });
    await app.manejadores['recoleccion:guardarCelda']({
      indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '80'
    });

    const historico = await app.manejadores['seguimiento:historico'](undefined);
    const fila = historico.find((h) => h.indicadorId === guardado.id);
    expect(fila).toBeDefined();
    const punto = fila!.puntos.find((p) => p.periodoId === periodoId);
    expect(punto?.valor).toBe(80);
    expect(punto?.cumplimientoPct).toBe(80);
  });

  it('evalúa la fórmula por período para indicadores calculados', async () => {
    const base = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ codigo: 'IND-BASE' }), valores: []
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: base.id });
    const hoy = new Date().toISOString().slice(0, 10);
    const periodoId = periodos.slice().reverse().find((p) => p.fechaFin < hoy)!.id;
    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: base.id, periodoId, fechaCorte: '2025-01-31' });
    await app.manejadores['recoleccion:guardarCelda']({
      indicadorId: base.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10'
    });

    const calculado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ nombre: 'Indicador calculado', esCalculado: true, formula: '[IND-BASE] * 2' }), valores: []
    });

    const historico = await app.manejadores['seguimiento:historico'](undefined);
    const fila = historico.find((h) => h.indicadorId === calculado.id);
    const punto = fila!.puntos.find((p) => p.periodoId === periodoId);
    expect(punto?.valor).toBe(20);
  });
});

describe('Composition root — atributos filtrables en Seguimiento', () => {
  it('expone el valor legible del atributo marcado como filtrable en el tablero', async () => {
    const atributo = await app.manejadores['atributos:guardar']({
      id: '', entidad: 'Indicador', nombre: 'Prioridad', descripcion: '', grupo: 'General', orden: 1,
      visible: true, editable: true, obligatorio: false, valorPorDefecto: null, tipoDato: TipoDato.ShortText,
      listaId: null, validaciones: [], condicionVisibilidad: null, condicionObligatorio: null, filtrable: true,
      activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador(),
      valores: [{ atributoId: atributo.id, entidadTipo: 'Indicador', entidadId: '', valorTexto: 'Alta', valorNumero: null, valorFecha: null, valorBooleano: null }]
    });

    const tablero = await app.manejadores['seguimiento:tablero'](undefined);
    const fila = tablero.find((f) => f.indicadorId === guardado.id);
    expect(fila?.atributosFiltro).toEqual([{ atributoId: atributo.id, nombre: 'Prioridad', valor: 'Alta' }]);
  });

  it('no incluye atributos no marcados como filtrables', async () => {
    await app.manejadores['atributos:guardar']({
      id: '', entidad: 'Indicador', nombre: 'Interno', descripcion: '', grupo: 'General', orden: 1,
      visible: true, editable: true, obligatorio: false, valorPorDefecto: null, tipoDato: TipoDato.ShortText,
      listaId: null, validaciones: [], condicionVisibilidad: null, condicionObligatorio: null, filtrable: false,
      activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    const guardado = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    const tablero = await app.manejadores['seguimiento:tablero'](undefined);
    const fila = tablero.find((f) => f.indicadorId === guardado.id);
    expect(fila?.atributosFiltro).toEqual([]);
  });
});

describe('Composition root — orígenes automáticos', () => {
  it('CRUD de orígenes automáticos vía IPC', async () => {
    const origen = await app.manejadores['origenes:guardar']({
      id: '', nombre: 'API institucional', tipo: 'API', descripcion: '',
      configuracion: { url: 'https://ejemplo.local/api', metodo: 'GET' }, parametrosGenerales: [],
      activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    expect(origen.id).not.toBe('');
    expect(await app.manejadores['origenes:listar'](undefined)).toHaveLength(1);
    await app.manejadores['origenes:eliminar']({ id: origen.id });
    expect(await app.manejadores['origenes:listar'](undefined)).toHaveLength(0);
  });

  it('rechaza obtenerAutomatico si el indicador no tiene la obtención automática configurada', async () => {
    const guardado = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await expect(
      app.manejadores['recoleccion:obtenerAutomatico']({ indicadorId: guardado.id, periodoId })
    ).rejects.toThrow(/obtención automática/);
  });

  it('rechaza si falta configurar la columna del valor', async () => {
    const origen = await app.manejadores['origenes:guardar']({
      id: '', nombre: 'Origen sin columna de valor', tipo: 'API', descripcion: '',
      configuracion: { url: 'http://127.0.0.1:9', metodo: 'GET' }, parametrosGenerales: [],
      activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    const guardado = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    await app.manejadores['automatizacion:guardar']({
      id: '', indicadorId: guardado.id, origenAutomaticoId: origen.id, parametrosDinamicos: [],
      script: '', columnaValor: null, mapeoColumnas: [], desagregacionesOmitidas: [], creadoEn: '', actualizadoEn: ''
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await expect(
      app.manejadores['recoleccion:obtenerAutomatico']({ indicadorId: guardado.id, periodoId })
    ).rejects.toThrow(/columna del valor/);
  });

  it('ejecuta el script real contra un servidor HTTP local y escribe los resultados mapeados por desagregación', async () => {
    const servidor = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([
        { sexo: '', total: '82.5' },
        { sexo: 'M', total: '90' },
        { sexo: 'F', total: '75' }
      ]));
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

    try {
      const origen = await app.manejadores['origenes:guardar']({
        id: '', nombre: 'API local de prueba', tipo: 'API', descripcion: '',
        configuracion: { url: `http://127.0.0.1:${puerto}`, metodo: 'GET' },
        parametrosGenerales: [{ nombre: 'anio', fuente: 'Anio' }], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      });

      const lista = await app.manejadores['listas:guardar']({
        id: '', nombre: 'Sexo', descripcion: '', prefijo: 'SEXO', estado: 'Activa', version: 1, orden: 1,
        jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      await app.manejadores['listas:guardarElemento']({
        id: '', listaId: lista.id, codigo: 'M', nombre: 'Masculino', descripcion: '', orden: 1, padreCodigo: null, activo: true
      });
      await app.manejadores['listas:guardarElemento']({
        id: '', listaId: lista.id, codigo: 'F', nombre: 'Femenino', descripcion: '', orden: 2, padreCodigo: null, activo: true
      });

      const guardado = await app.manejadores['indicadores:guardar']({
        indicador: indicador({ desagregaciones: [lista.id] }), valores: []
      });

      await app.manejadores['automatizacion:guardar']({
        id: '', indicadorId: guardado.id, origenAutomaticoId: origen.id, parametrosDinamicos: [],
        script: '', columnaValor: 'total', mapeoColumnas: [{ columna: 'sexo', listaId: lista.id }],
        desagregacionesOmitidas: [], creadoEn: '', actualizadoEn: ''
      });

      const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
      const hoy = new Date().toISOString().slice(0, 10);
      const periodoId = periodos.slice().reverse().find((p) => p.fechaFin < hoy)!.id;
      await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });

      const resultado = await app.manejadores['recoleccion:obtenerAutomatico']({ indicadorId: guardado.id, periodoId });
      expect(resultado.celdasActualizadas).toBe(3);
      expect(resultado.filasConError).toBe(0);
      expect(resultado.desagregacionesSinMapear).toEqual([]);

      const captura = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId });
      expect(captura.filas.find((f) => f.esGeneral)?.valor).toBe(82.5);
      expect(captura.filas.find((f) => f.claveDesagregacion.includes('=M'))?.valor).toBe(90);
      expect(captura.filas.find((f) => f.claveDesagregacion.includes('=F'))?.valor).toBe(75);
    } finally {
      servidor.close();
    }
  });

  it('marca las desagregaciones sin mapear y solo completa la fila General', async () => {
    const servidor = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([{ total: '50' }]));
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

    try {
      const origen = await app.manejadores['origenes:guardar']({
        id: '', nombre: 'API sin mapeo de desagregación', tipo: 'API', descripcion: '',
        configuracion: { url: `http://127.0.0.1:${puerto}`, metodo: 'GET' }, parametrosGenerales: [],
        activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      const lista = await app.manejadores['listas:guardar']({
        id: '', nombre: 'Provincia', descripcion: '', prefijo: 'PROV', estado: 'Activa', version: 1, orden: 1,
        jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      const guardado = await app.manejadores['indicadores:guardar']({
        indicador: indicador({ desagregaciones: [lista.id] }), valores: []
      });
      await app.manejadores['automatizacion:guardar']({
        id: '', indicadorId: guardado.id, origenAutomaticoId: origen.id, parametrosDinamicos: [],
        script: '', columnaValor: 'total', mapeoColumnas: [], desagregacionesOmitidas: [], creadoEn: '', actualizadoEn: ''
      });
      const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
      const hoy = new Date().toISOString().slice(0, 10);
      const periodoId = periodos.slice().reverse().find((p) => p.fechaFin < hoy)!.id;
      await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });

      const resultado = await app.manejadores['recoleccion:obtenerAutomatico']({ indicadorId: guardado.id, periodoId });
      expect(resultado.celdasActualizadas).toBe(1);
      expect(resultado.desagregacionesSinMapear).toEqual([lista.id]);

      const captura = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId });
      expect(captura.filas.find((f) => f.esGeneral)?.valor).toBe(50);
    } finally {
      servidor.close();
    }
  });

  it('origenes:probarCodigo ejecuta el script real y devuelve la vista previa sin recortar cuando hay pocas filas', async () => {
    const servidor = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([{ id: '1', total: '10' }, { id: '2', total: '20' }]));
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
    try {
      const origen = {
        id: '', nombre: 'Origen de prueba de código', tipo: 'API' as const, descripcion: '',
        configuracion: { url: `http://127.0.0.1:${puerto}`, metodo: 'GET' }, parametrosGenerales: [],
        activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      };
      const resultado = await app.manejadores['origenes:probarCodigo']({ origen, script: '' });
      expect(resultado.columnas.sort()).toEqual(['id', 'total']);
      expect(resultado.totalFilas).toBe(2);
      expect(resultado.filas).toHaveLength(2);
      expect(resultado.truncado).toBe(false);
    } finally {
      servidor.close();
    }
  });

  it('origenes:probarCodigo recorta a 100 filas de visualización cuando el origen devuelve más', async () => {
    const servidor = createServer((_req, res) => {
      const filas = Array.from({ length: 150 }, (_, i) => ({ id: String(i), total: String(i * 10) }));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(filas));
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
    try {
      const origen = {
        id: '', nombre: 'Origen de 150 filas', tipo: 'API' as const, descripcion: '',
        configuracion: { url: `http://127.0.0.1:${puerto}`, metodo: 'GET' }, parametrosGenerales: [],
        activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      };
      const resultado = await app.manejadores['origenes:probarCodigo']({ origen, script: '' });
      expect(resultado.totalFilas).toBe(150);
      expect(resultado.filas).toHaveLength(100);
      expect(resultado.truncado).toBe(true);
    } finally {
      servidor.close();
    }
  });

  it('origenes:probarCodigo propaga un error legible cuando el origen falla', async () => {
    const servidor = createServer((_req, res) => {
      res.statusCode = 500;
      res.end('boom');
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;
    try {
      const origen = {
        id: '', nombre: 'Origen que falla', tipo: 'API' as const, descripcion: '',
        configuracion: { url: `http://127.0.0.1:${puerto}`, metodo: 'GET' }, parametrosGenerales: [],
        activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      };
      await expect(app.manejadores['origenes:probarCodigo']({ origen, script: '' })).rejects.toThrow();
    } finally {
      servidor.close();
    }
  });
});

describe('Composition root — XMLA con autenticación OAuth2 (Client Credentials)', () => {
  it('obtiene un access token real y lo usa como Bearer al probar la conexión', async () => {
    const TOKEN_VALIDO = 'token-de-prueba-123';
    const servidor = createServer((req, res) => {
      if (req.url === '/token') {
        const trozos: Buffer[] = [];
        req.on('data', (d) => trozos.push(d));
        req.on('end', () => {
          const cuerpo = Buffer.concat(trozos).toString('utf-8');
          const parametros = new URLSearchParams(cuerpo);
          const credencialesOk = parametros.get('grant_type') === 'client_credentials'
            && parametros.get('client_id') === 'cid-valido'
            && parametros.get('client_secret') === 'secreto-valido';
          res.setHeader('Content-Type', 'application/json');
          if (!credencialesOk) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'invalid_client' }));
            return;
          }
          res.end(JSON.stringify({ access_token: TOKEN_VALIDO, expires_in: 3600 }));
        });
        return;
      }
      if (req.url === '/xmla') {
        const autorizacion = req.headers.authorization;
        res.setHeader('Content-Type', 'text/xml; charset=utf-8');
        if (autorizacion === `Bearer ${TOKEN_VALIDO}`) {
          res.end('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><DiscoverResponse/></soap:Body></soap:Envelope>');
        } else {
          res.statusCode = 500;
          res.end('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultstring>No autorizado</faultstring></soap:Fault></soap:Body></soap:Envelope>');
        }
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

    try {
      const resultado = await app.manejadores['origenes:probar']({
        id: 'origen-oauth2', nombre: 'SSAS con OAuth2', tipo: 'XMLA', descripcion: '',
        configuracion: {
          servidor: `http://127.0.0.1:${puerto}/xmla`,
          autenticacion: 'oauth2',
          tokenUrl: `http://127.0.0.1:${puerto}/token`,
          clienteId: 'cid-valido',
          clienteSecreto: 'secreto-valido'
        },
        parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      expect(resultado.ok).toBe(true);
    } finally {
      servidor.close();
    }
  });

  it('credenciales OAuth2 inválidas hacen fallar la prueba con un mensaje claro, sin llegar a XMLA', async () => {
    const servidor = createServer((req, res) => {
      if (req.url === '/token') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid_client', error_description: 'Client secret inválido' }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

    try {
      const resultado = await app.manejadores['origenes:probar']({
        id: 'origen-oauth2-malo', nombre: 'SSAS con OAuth2 inválido', tipo: 'XMLA', descripcion: '',
        configuracion: {
          servidor: `http://127.0.0.1:${puerto}/xmla`,
          autenticacion: 'oauth2',
          tokenUrl: `http://127.0.0.1:${puerto}/token`,
          clienteId: 'cid-malo',
          clienteSecreto: 'secreto-malo'
        },
        parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain('servidor de token');
    } finally {
      servidor.close();
    }
  });
});

describe('Composition root — XMLA envía el SOAPAction correcto por operación', () => {
  it('"origenes:probar" (Discover) y "origenes:probarCodigo" (Execute) usan cada uno su propio SOAPAction', async () => {
    const soapActionsRecibidas: string[] = [];
    const servidor = createServer((req, res) => {
      soapActionsRecibidas.push(req.headers.soapaction as string);
      res.setHeader('Content-Type', 'text/xml; charset=utf-8');
      if (req.url === '/xmla-discover') {
        res.end('<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><DiscoverResponse/></soap:Body></soap:Envelope>');
        return;
      }
      // Respuesta Execute mínima con un dataset de 2 ejes (1 columna, 1 fila) para no fallar al aplanar.
      res.end(`<?xml version="1.0"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body><ExecuteResponse><return><root>
            <Axes>
              <Axis name="Axis0"><Tuples><Tuple><Member Hierarchy="[Measures]"><Caption>Total</Caption></Member></Tuple></Tuples></Axis>
              <Axis name="Axis1"><Tuples><Tuple><Member Hierarchy="[Dim]"><Caption>Fila1</Caption></Member></Tuple></Tuples></Axis>
            </Axes>
            <CellData><Cell CellOrdinal="0"><Value>42</Value></Cell></CellData>
          </root></return></ExecuteResponse></soap:Body>
        </soap:Envelope>`);
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

    try {
      const origenBase = {
        id: 'origen-xmla-soapaction', nombre: 'XMLA soapaction', tipo: 'XMLA' as const, descripcion: '',
        parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      };
      await app.manejadores['origenes:probar']({
        ...origenBase, configuracion: { servidor: `http://127.0.0.1:${puerto}/xmla-discover` }
      });
      await app.manejadores['origenes:probarCodigo']({
        origen: { ...origenBase, configuracion: { servidor: `http://127.0.0.1:${puerto}/xmla-execute` } },
        script: 'SELECT {[Measures].[Total]} ON 0, {[Dim].[Fila1]} ON 1 FROM [Modelo]'
      });

      expect(soapActionsRecibidas).toHaveLength(2);
      expect(soapActionsRecibidas[0]).toBe('"urn:schemas-microsoft-com:xml-analysis:Discover"');
      expect(soapActionsRecibidas[1]).toBe('"urn:schemas-microsoft-com:xml-analysis:Execute"');
    } finally {
      servidor.close();
    }
  });
});

/**
 * A diferencia de XMLA (que necesita el proveedor propietario MSOLAP, ver
 * ConectorXmla), la API REST "Execute Queries" de Power BI es HTTPS+JSON
 * estándar — así que, a diferencia del origen "PowerBI" contra el host real
 * `api.powerbi.com`, sí se puede probar de punta a punta contra un servidor
 * HTTP local real, sin mocks, gracias a `configuracion.apiBase`.
 */
describe('Composition root — PowerBI (API REST "Execute Queries")', () => {
  function crearServidorToken(handlerExtra: (req: IncomingMessage, res: ServerResponse) => void) {
    return createServer((req, res) => {
      if (req.url === '/token') {
        const trozos: Buffer[] = [];
        req.on('data', (d) => trozos.push(d));
        req.on('end', () => {
          const parametros = new URLSearchParams(Buffer.concat(trozos).toString('utf-8'));
          const credencialesOk = parametros.get('grant_type') === 'client_credentials'
            && parametros.get('client_id') === 'cid-pbi'
            && parametros.get('client_secret') === 'secreto-pbi';
          res.setHeader('Content-Type', 'application/json');
          if (!credencialesOk) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'invalid_client' }));
            return;
          }
          res.end(JSON.stringify({ access_token: 'token-powerbi-123', expires_in: 3600 }));
        });
        return;
      }
      handlerExtra(req, res);
    });
  }

  async function levantar(servidor: ReturnType<typeof createServer>): Promise<number> {
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    return typeof direccion === 'object' && direccion ? direccion.port : 0;
  }

  it('"origenes:probar" obtiene un token OAuth2 real y ejecuta la consulta DAX de prueba contra "Mi área de trabajo"', async () => {
    const servidor = crearServidorToken((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/v1.0/myorg/datasets/dataset-abc/executeQueries' && req.headers.authorization === 'Bearer token-powerbi-123') {
        res.end(JSON.stringify({ results: [{ tables: [{ rows: [{ '[Value]': 1 }] }] }] }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { message: 'No encontrado' } }));
    });
    const puerto = await levantar(servidor);

    try {
      const resultado = await app.manejadores['origenes:probar']({
        id: 'origen-pbi', nombre: 'Power BI dataset', tipo: 'PowerBI', descripcion: '',
        configuracion: {
          apiBase: `http://127.0.0.1:${puerto}/v1.0/myorg`,
          datasetId: 'dataset-abc',
          autenticacion: 'oauth2',
          tokenUrl: `http://127.0.0.1:${puerto}/token`,
          clienteId: 'cid-pbi',
          clienteSecreto: 'secreto-pbi'
        },
        parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      expect(resultado.ok).toBe(true);
    } finally {
      servidor.close();
    }
  });

  it('"origenes:probarCodigo" ejecuta un DAX real (con workspace) y devuelve filas/columnas tabulares', async () => {
    const capturado: { cuerpo: { queries?: { query: string }[] } | null } = { cuerpo: null };
    const servidor = crearServidorToken((req, res) => {
      if (req.url !== '/v1.0/myorg/groups/grupo-1/datasets/dataset-xyz/executeQueries') {
        res.statusCode = 404;
        res.end();
        return;
      }
      const trozos: Buffer[] = [];
      req.on('data', (d) => trozos.push(d));
      req.on('end', () => {
        capturado.cuerpo = JSON.parse(Buffer.concat(trozos).toString('utf-8')) as { queries?: { query: string }[] };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          results: [{ tables: [{ rows: [{ Producto: 'A', Ventas: 10 }, { Producto: 'B', Ventas: 20 }] }] }]
        }));
      });
    });
    const puerto = await levantar(servidor);

    try {
      const resultado = await app.manejadores['origenes:probarCodigo']({
        origen: {
          id: 'origen-pbi-2', nombre: 'Power BI dataset con workspace', tipo: 'PowerBI', descripcion: '',
          configuracion: {
            apiBase: `http://127.0.0.1:${puerto}/v1.0/myorg`,
            datasetId: 'dataset-xyz',
            groupId: 'grupo-1',
            autenticacion: 'oauth2',
            tokenUrl: `http://127.0.0.1:${puerto}/token`,
            clienteId: 'cid-pbi',
            clienteSecreto: 'secreto-pbi'
          },
          parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
        },
        script: "EVALUATE 'Ventas'"
      });
      expect(resultado.columnas.sort()).toEqual(['Producto', 'Ventas']);
      expect(resultado.filas).toHaveLength(2);
      expect(resultado.totalFilas).toBe(2);
      expect(resultado.filas[0]?.Producto).toBe('A');
      expect(resultado.filas[1]?.Ventas).toBe('20');
      expect(capturado.cuerpo?.queries?.[0]?.query).toBe("EVALUATE 'Ventas'");
    } finally {
      servidor.close();
    }
  });

  it('sin datasetId, "origenes:probar" falla explícito sin intentar la conexión', async () => {
    const resultado = await app.manejadores['origenes:probar']({
      id: 'origen-pbi-sin-dataset', nombre: 'Power BI sin dataset', tipo: 'PowerBI', descripcion: '',
      configuracion: { autenticacion: 'oauth2', tokenUrl: 'http://127.0.0.1:1/token', clienteId: 'x', clienteSecreto: 'y' },
      parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('datasetId');
  });

  it('sin autenticación configurada, "origenes:probar" falla con un mensaje claro (la API REST no admite Basic)', async () => {
    const resultado = await app.manejadores['origenes:probar']({
      id: 'origen-pbi-sin-auth', nombre: 'Power BI sin autenticación', tipo: 'PowerBI', descripcion: '',
      configuracion: { datasetId: 'dataset-abc' },
      parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toMatch(/no admite Basic/);
  });

  it('un error real de la API de Power BI (p. ej. dataset inexistente) se propaga con su mensaje, no como error de transporte genérico', async () => {
    const servidor = crearServidorToken((req, res) => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'DatasetNotFound', message: 'El dataset especificado no existe.' } }));
    });
    const puerto = await levantar(servidor);

    try {
      const resultado = await app.manejadores['origenes:probar']({
        id: 'origen-pbi-404', nombre: 'Power BI dataset inexistente', tipo: 'PowerBI', descripcion: '',
        configuracion: {
          apiBase: `http://127.0.0.1:${puerto}/v1.0/myorg`,
          datasetId: 'no-existe',
          autenticacion: 'oauth2',
          tokenUrl: `http://127.0.0.1:${puerto}/token`,
          clienteId: 'cid-pbi',
          clienteSecreto: 'secreto-pbi'
        },
        parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      expect(resultado.ok).toBe(false);
      expect(resultado.mensaje).toContain('El dataset especificado no existe.');
    } finally {
      servidor.close();
    }
  });
});

describe('Composition root — XMLA rechaza endpoints solo alcanzables por MSOLAP (powerbi://, asazure.windows.net)', () => {
  it('un servidor powerbi:// falla de inmediato con un mensaje que redirige al tipo PowerBI, sin intentar la conexión', async () => {
    const resultado = await app.manejadores['origenes:probar']({
      id: 'origen-xmla-powerbi', nombre: 'XMLA apuntando a Power BI', tipo: 'XMLA', descripcion: '',
      configuracion: { servidor: 'powerbi://api.powerbi.com/v1.0/myorg/MiWorkspace' },
      parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('tipo "PowerBI"');
  });

  it('un servidor *.asazure.windows.net falla de inmediato con un mensaje explícito', async () => {
    const resultado = await app.manejadores['origenes:probar']({
      id: 'origen-xmla-asazure', nombre: 'XMLA apuntando a Azure AS', tipo: 'XMLA', descripcion: '',
      configuracion: { servidor: 'https://miservidor.asazure.windows.net/servers/miservidor' },
      parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).toContain('Azure Analysis Services');
  });
});
