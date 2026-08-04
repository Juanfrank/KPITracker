import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
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
    origenAutomaticoId: null, parametrosOrigen: null,
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
      id: '', nombre: 'Sexo', descripcion: '', prefijo: 'SEXO', estado: 'Activa', version: 1, orden: 1, jerarquica: false, creadoEn: '', actualizadoEn: ''
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
      id: '', nombre: 'Ana', correo: null, activo: true, creadoEn: '', actualizadoEn: ''
    });
    const categoriaOriginal = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Original', descripcion: '', activo: true, creadoEn: '', actualizadoEn: ''
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
      id: '', nombre: 'Beto', correo: null, activo: true, creadoEn: '', actualizadoEn: ''
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
    const base = { id: '', nombre: 'Sexo', descripcion: '', estado: 'Activa' as const, version: 1, orden: 1, jerarquica: false, creadoEn: '', actualizadoEn: '' };
    await expect(app.manejadores['listas:guardar']({ ...base, prefijo: '' })).rejects.toThrow(/prefijo/);
    await expect(app.manejadores['listas:guardar']({ ...base, prefijo: 'SEXO-1' })).rejects.toThrow(/alfabético/);
    await expect(app.manejadores['listas:guardar']({ ...base, prefijo: 'SEXO 1' })).rejects.toThrow(/alfabético/);
  });

  it('normaliza un prefijo en minúsculas a mayúsculas', async () => {
    const guardada = await app.manejadores['listas:guardar']({
      id: '', nombre: 'Sexo', descripcion: '', prefijo: 'sexo', estado: 'Activa', version: 1, orden: 1, jerarquica: false, creadoEn: '', actualizadoEn: ''
    });
    expect(guardada.prefijo).toBe('SEXO');
  });

  it('rechaza dos listas con el mismo prefijo', async () => {
    const base = { id: '', descripcion: '', estado: 'Activa' as const, version: 1, orden: 1, jerarquica: false, creadoEn: '', actualizadoEn: '' };
    await app.manejadores['listas:guardar']({ ...base, nombre: 'Sexo', prefijo: 'SEXO' });
    await expect(app.manejadores['listas:guardar']({ ...base, nombre: 'Sexo 2', prefijo: 'SEXO' })).rejects.toThrow(/prefijo/);
  });

  it('autogenera el código del elemento a partir del prefijo y exige nombre', async () => {
    const lista = await app.manejadores['listas:guardar']({
      id: '', nombre: 'Sexo', descripcion: '', prefijo: 'SEXO', estado: 'Activa', version: 1, orden: 1, jerarquica: false, creadoEn: '', actualizadoEn: ''
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
      activo: true, creadoEn: '', actualizadoEn: ''
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
      activo: true, creadoEn: '', actualizadoEn: ''
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
      configuracion: { url: 'https://ejemplo.local/api', metodo: 'GET' }, activo: true, creadoEn: '', actualizadoEn: ''
    });
    expect(origen.id).not.toBe('');
    expect(await app.manejadores['origenes:listar'](undefined)).toHaveLength(1);
    await app.manejadores['origenes:eliminar']({ id: origen.id });
    expect(await app.manejadores['origenes:listar'](undefined)).toHaveLength(0);
  });

  it('rechaza obtenerAutomatico si el indicador no tiene origen configurado', async () => {
    const guardado = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await expect(
      app.manejadores['recoleccion:obtenerAutomatico']({ indicadorId: guardado.id, periodoId })
    ).rejects.toThrow(/origen automático/);
  });

  it('rechaza con NoImplementadoError cuando el indicador sí tiene origen configurado', async () => {
    const origen = await app.manejadores['origenes:guardar']({
      id: '', nombre: 'API institucional', tipo: 'API', descripcion: '',
      configuracion: {}, activo: true, creadoEn: '', actualizadoEn: ''
    });
    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ origenAutomaticoId: origen.id }), valores: []
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await expect(
      app.manejadores['recoleccion:obtenerAutomatico']({ indicadorId: guardado.id, periodoId })
    ).rejects.toThrow(/no está implementada/);
  });
});
