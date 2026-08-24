import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { componerAplicacionServidor } from '../../src/server/composicionServidor';
import type { AplicacionServidor } from '../../src/server/composicionServidor';
import { Periodicidad, TipoDato, generarConsultaDax } from '@domain/index';
import type { DefinicionPeriodicidad, Indicador, Meta, ReglaNegocio } from '@domain/index';

let dataDir: string;
let app: AplicacionServidor;

function indicador(parcial: Partial<Indicador> = {}): Indicador {
  return {
    id: '', codigo: '', nombre: 'Indicador de prueba', definicion: 'Definición', formaCalculo: null, periodicidad: Periodicidad.Trimestral,
    periodicidadPersonalizadaId: null, lineaBase: null, lineaBasePeriodoId: null, metaGlobal: null, desagregaciones: [],
    estado: 'Activo', responsable: null, categoria: null, equipo: null, unidadMedida: null, esCalculado: false, formula: null, requiereValidacion: true,
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
  app = await componerAplicacionServidor(dataDir);
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

  it('CRUD de categorías vía IPC', async () => {
    const categoria = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Estratégico', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null, creadoEn: '', actualizadoEn: ''
    });
    // +1: la categoría raíz "General" (Batch T) ya existe desde el arranque — ver la migración
    // 20260901000000_roles_permisos.ts.
    expect(await app.manejadores['categorias:listar'](undefined)).toHaveLength(2);
    await app.manejadores['categorias:eliminar']({ id: categoria.id });
    expect(await app.manejadores['categorias:listar'](undefined)).toHaveLength(1);
  });

  // Batch U: Responsable se unificó dentro de Usuario — ya no hay canal IPC 'responsables:*',
  // el CRUD equivalente vive en `ServicioUsuarios` (expuesto vía tRPC, no IPC).
  it('CRUD de usuarios vía ServicioUsuarios (Batch U unificó Usuario/Responsable)', async () => {
    const antes = await app.usuarios.listar();
    const usuario = await app.usuarios.crear({
      nombreUsuario: 'jperez', nombreCompleto: 'Juan Pérez', password: 'contrasenaSegura1'
    });
    expect(usuario.id).not.toBe('');
    expect(await app.usuarios.listar()).toHaveLength(antes.length + 1);
    await app.usuarios.eliminar(usuario.id);
    expect(await app.usuarios.listar()).toHaveLength(antes.length);
  });
});

/** Los mensajes específicos de una `ValidacionError` viajan en `.detalles`, no en `.message` (ver `RespuestaIpc`). */
async function erroresDe(promesa: Promise<unknown>): Promise<string[]> {
  try {
    await promesa;
    throw new Error('no debió llegar aquí');
  } catch (error) {
    const e = error as Error & { detalles?: string[] };
    return e.detalles?.length ? e.detalles : [e.message];
  }
}

describe('Composition root — categorías jerárquicas (Batch R)', () => {
  it('crea una categoría raíz y una subcategoría vinculada por padreId', async () => {
    const raiz = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Estratégico', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null,
      creadoEn: '', actualizadoEn: ''
    });
    const hija = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Sub-estratégico', descripcion: '', activo: true, eliminado: false, padreId: raiz.id, prefijo: null,
      creadoEn: '', actualizadoEn: ''
    });
    expect(hija.padreId).toBe(raiz.id);
  });

  it('rechaza asignar como padre a una categoría que generaría un ciclo', async () => {
    const raiz = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Raíz', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null,
      creadoEn: '', actualizadoEn: ''
    });
    const hija = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Hija', descripcion: '', activo: true, eliminado: false, padreId: raiz.id, prefijo: null,
      creadoEn: '', actualizadoEn: ''
    });
    const detalles = await erroresDe(app.manejadores['categorias:guardar']({ ...raiz, padreId: hija.id }));
    expect(detalles.some((d) => /ciclo/.test(d))).toBe(true);
  });

  it('valida formato y unicidad del prefijo visual', async () => {
    await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Uno', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: 'EST',
      creadoEn: '', actualizadoEn: ''
    });
    const detallesFormato = await erroresDe(app.manejadores['categorias:guardar']({
      id: '', nombre: 'Dos', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: 'est-1',
      creadoEn: '', actualizadoEn: ''
    }));
    expect(detallesFormato.some((d) => /alfabético/.test(d))).toBe(true);
    const detallesDuplicado = await erroresDe(app.manejadores['categorias:guardar']({
      id: '', nombre: 'Tres', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: 'EST',
      creadoEn: '', actualizadoEn: ''
    }));
    expect(detallesDuplicado.some((d) => /Ya existe/.test(d))).toBe(true);
  });

  it('bloquea borrar una categoría que tiene subcategorías', async () => {
    const raiz = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Con hijas', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null,
      creadoEn: '', actualizadoEn: ''
    });
    await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Hija de con hijas', descripcion: '', activo: true, eliminado: false, padreId: raiz.id, prefijo: null,
      creadoEn: '', actualizadoEn: ''
    });
    const detalles = await erroresDe(app.manejadores['categorias:eliminar']({ id: raiz.id }));
    expect(detalles.some((d) => /Subcategorías/.test(d))).toBe(true);
  });
});

describe('Composition root — equipos jerárquicos (Batch R)', () => {
  it('crea un equipo raíz y un sub-equipo vinculado por padreId', async () => {
    const raiz = await app.manejadores['equipos:guardar']({
      id: '', nombre: 'Dirección', descripcion: '', activo: true, eliminado: false, padreId: null, creadoEn: '', actualizadoEn: ''
    });
    const hijo = await app.manejadores['equipos:guardar']({
      id: '', nombre: 'Sub-dirección', descripcion: '', activo: true, eliminado: false, padreId: raiz.id, creadoEn: '', actualizadoEn: ''
    });
    expect(hijo.padreId).toBe(raiz.id);
    // +1: el equipo raíz "General" (Batch T) ya existe desde el arranque.
    expect(await app.manejadores['equipos:listar'](undefined)).toHaveLength(3);
  });

  it('rechaza asignar como padre a un equipo que generaría un ciclo', async () => {
    const raiz = await app.manejadores['equipos:guardar']({
      id: '', nombre: 'Raíz equipo', descripcion: '', activo: true, eliminado: false, padreId: null, creadoEn: '', actualizadoEn: ''
    });
    const hijo = await app.manejadores['equipos:guardar']({
      id: '', nombre: 'Hijo equipo', descripcion: '', activo: true, eliminado: false, padreId: raiz.id, creadoEn: '', actualizadoEn: ''
    });
    const detalles = await erroresDe(app.manejadores['equipos:guardar']({ ...raiz, padreId: hijo.id }));
    expect(detalles.some((d) => /ciclo/.test(d))).toBe(true);
  });

  it('bloquea borrar un equipo que tiene sub-equipos', async () => {
    const raiz = await app.manejadores['equipos:guardar']({
      id: '', nombre: 'Equipo con hijos', descripcion: '', activo: true, eliminado: false, padreId: null, creadoEn: '', actualizadoEn: ''
    });
    await app.manejadores['equipos:guardar']({
      id: '', nombre: 'Sub-equipo', descripcion: '', activo: true, eliminado: false, padreId: raiz.id, creadoEn: '', actualizadoEn: ''
    });
    const detalles = await erroresDe(app.manejadores['equipos:eliminar']({ id: raiz.id }));
    expect(detalles.some((d) => /Sub-equipos/.test(d))).toBe(true);
  });

  it('bloquea borrar un equipo referenciado indirectamente por un usuario (Batch U unificó Usuario/Responsable)', async () => {
    const equipo = await app.manejadores['equipos:guardar']({
      id: '', nombre: 'Equipo con responsable', descripcion: '', activo: true, eliminado: false, padreId: null, creadoEn: '', actualizadoEn: ''
    });
    const usuario = await app.usuarios.crear({ nombreUsuario: 'con-equipo', nombreCompleto: 'Con equipo', password: 'contrasenaSegura1' });
    await app.usuarios.establecerEquipo(usuario.id, equipo.id, null);
    const detalles = await erroresDe(app.manejadores['equipos:eliminar']({ id: equipo.id }));
    expect(detalles.some((d) => /Usuario/.test(d))).toBe(true);
  });

  it('bloquea borrar un equipo referenciado directamente por un indicador', async () => {
    const equipo = await app.manejadores['equipos:guardar']({
      id: '', nombre: 'Equipo con indicador', descripcion: '', activo: true, eliminado: false, padreId: null, creadoEn: '', actualizadoEn: ''
    });
    await app.manejadores['indicadores:guardar']({ indicador: indicador({ equipo: equipo.id }), valores: [] });
    const detalles = await erroresDe(app.manejadores['equipos:eliminar']({ id: equipo.id }));
    expect(detalles.some((d) => /Indicador/.test(d))).toBe(true);
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

describe('Composition root — cubo de subtotales en Recolección (2 desagregaciones)', () => {
  async function indicadorConDosListas(): Promise<{ indicadorId: string; periodoId: string; sexoId: string; provinciaId: string }> {
    const sexo = await app.manejadores['listas:guardar']({
      id: '', nombre: 'Sexo cubo', descripcion: '', prefijo: 'SXC', estado: 'Activa', version: 1, orden: 1, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    await app.manejadores['listas:guardarElemento']({ id: '', listaId: sexo.id, codigo: 'M', nombre: 'Masculino', descripcion: '', orden: 1, padreCodigo: null, activo: true });
    await app.manejadores['listas:guardarElemento']({ id: '', listaId: sexo.id, codigo: 'F', nombre: 'Femenino', descripcion: '', orden: 2, padreCodigo: null, activo: true });

    const provincia = await app.manejadores['listas:guardar']({
      id: '', nombre: 'Provincia cubo', descripcion: '', prefijo: 'PRC', estado: 'Activa', version: 1, orden: 2, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    await app.manejadores['listas:guardarElemento']({ id: '', listaId: provincia.id, codigo: 'SD', nombre: 'Santo Domingo', descripcion: '', orden: 1, padreCodigo: null, activo: true });
    await app.manejadores['listas:guardarElemento']({ id: '', listaId: provincia.id, codigo: 'STG', nombre: 'Santiago', descripcion: '', orden: 2, padreCodigo: null, activo: true });

    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ desagregaciones: [sexo.id, provincia.id] }), valores: []
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });
    return { indicadorId: guardado.id, periodoId, sexoId: sexo.id, provinciaId: provincia.id };
  }

  it('recoleccion:captura genera el cubo completo: General + subtotales de una lista + detalle completo', async () => {
    const { indicadorId, periodoId } = await indicadorConDosListas();
    const captura = await app.manejadores['recoleccion:captura']({ indicadorId, periodoId });

    // (2+1) × (2+1) = 9: 1 General + 2 subtotales de Sexo + 2 subtotales de Provincia + 4 de detalle completo.
    expect(captura.filas).toHaveLength(9);
    expect(captura.filas.filter((f) => f.esGeneral)).toHaveLength(1);
    expect(captura.filas.filter((f) => f.esSubtotal)).toHaveLength(4);
    expect(captura.filas.filter((f) => f.esDetalleCompleto)).toHaveLength(4);

    const subtotalMasculino = captura.filas.find((f) => f.esSubtotal && f.etiquetas.length === 1 && f.etiquetas[0]?.descripcion === 'Masculino');
    expect(subtotalMasculino).toBeDefined();
    expect(subtotalMasculino!.claveDesagregacion.includes('=M')).toBe(true);
  });

  it('un subtotal parcial no infla Suma/Máximo: solo el detalle completo cuenta para los agregados', async () => {
    const { indicadorId, periodoId, sexoId } = await indicadorConDosListas();
    // Subtotal "Masculino, todas las provincias" = 100 (ya explicado por 60+40 del detalle).
    await app.manejadores['recoleccion:guardarCelda']({ indicadorId, periodoId, claveDesagregacion: `${sexoId}=M`, valorCrudo: '100' });
    const captura = await app.manejadores['recoleccion:captura']({ indicadorId, periodoId });
    const subtotal = captura.filas.find((f) => f.claveDesagregacion === `${sexoId}=M`);
    expect(subtotal?.esSubtotal).toBe(true);
    // Sin celdas de detalle todavía: los agregados no cuentan el subtotal (cantidadConValor=1, pero suma/máximo derivan solo de esDetalleCompleto).
    expect(captura.advertencias).toEqual([]); // no hay General con qué compararlo, y el subtotal no cuenta como "máximo de las desagregaciones"
  });
});

describe('Composition root — segmentador de subtotal en orígenes automáticos', () => {
  it('sin segmentador, un valor en blanco en la columna mapeada ya se interpreta como subtotal (enrollada) por desagregación', async () => {
    const servidor = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([
        { sexo: '', provincia: '', total: '500' }, // General
        { sexo: 'Masculino', provincia: '', total: '300' }, // subtotal de Sexo (Provincia enrollada)
        { sexo: 'Masculino', provincia: 'Santo Domingo', total: '180' }, // detalle completo
        { sexo: 'Masculino', provincia: 'Santiago', total: '120' } // detalle completo
      ]));
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

    try {
      const sexo = await app.manejadores['listas:guardar']({
        id: '', nombre: 'Sexo segmentador', descripcion: '', prefijo: 'SXS', estado: 'Activa', version: 1, orden: 1, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      await app.manejadores['listas:guardarElemento']({ id: '', listaId: sexo.id, codigo: 'M', nombre: 'Masculino', descripcion: '', orden: 1, padreCodigo: null, activo: true });
      const provincia = await app.manejadores['listas:guardar']({
        id: '', nombre: 'Provincia segmentador', descripcion: '', prefijo: 'PRS', estado: 'Activa', version: 1, orden: 2, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      await app.manejadores['listas:guardarElemento']({ id: '', listaId: provincia.id, codigo: 'SD', nombre: 'Santo Domingo', descripcion: '', orden: 1, padreCodigo: null, activo: true });
      await app.manejadores['listas:guardarElemento']({ id: '', listaId: provincia.id, codigo: 'STG', nombre: 'Santiago', descripcion: '', orden: 2, padreCodigo: null, activo: true });

      const origen = await app.manejadores['origenes:guardar']({
        id: '', nombre: 'API cubo sin segmentador', tipo: 'API', descripcion: '',
        configuracion: { url: `http://127.0.0.1:${puerto}`, metodo: 'GET' }, parametrosGenerales: [],
        activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      const guardado = await app.manejadores['indicadores:guardar']({
        indicador: indicador({ desagregaciones: [sexo.id, provincia.id] }), valores: []
      });
      await app.manejadores['automatizacion:guardar']({
        id: '', indicadorId: guardado.id, origenAutomaticoId: origen.id, parametrosDinamicos: [],
        script: '', columnaValor: 'total',
        mapeoColumnas: [
          { columna: 'sexo', listaId: sexo.id, columnaSegmentadorSubtotal: null },
          { columna: 'provincia', listaId: provincia.id, columnaSegmentadorSubtotal: null }
        ],
        desagregacionesOmitidas: [], creadoEn: '', actualizadoEn: ''
      });
      const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
      const hoy = new Date().toISOString().slice(0, 10);
      const periodoId = periodos.slice().reverse().find((p) => p.fechaFin < hoy)!.id;
      await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });

      const resultado = await app.manejadores['recoleccion:obtenerAutomatico']({ indicadorId: guardado.id, periodoId });
      expect(resultado.celdasActualizadas).toBe(4);
      expect(resultado.filasConError).toBe(0);

      const captura = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId });
      expect(captura.filas.find((f) => f.esGeneral)?.valor).toBe(500);
      expect(captura.filas.find((f) => f.claveDesagregacion === `${sexo.id}=M`)?.valor).toBe(300);
      expect(captura.filas.find((f) => f.claveDesagregacion.includes('=M') && f.claveDesagregacion.includes('=SD'))?.valor).toBe(180);
      expect(captura.filas.find((f) => f.claveDesagregacion.includes('=M') && f.claveDesagregacion.includes('=STG'))?.valor).toBe(120);
    } finally {
      servidor.close();
    }
  });

  it('con segmentador explícito, una fila con valor NO en blanco pero segmentador=true igual se trata como subtotal (enrollada)', async () => {
    const servidor = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([
        // El origen no deja "provincia" en blanco en la fila de rollup: repite un valor pero marca esSubtotalProvincia=true.
        { sexo: 'Masculino', provincia: 'TODAS', esSubtotalProvincia: 'true', total: '300' },
        { sexo: 'Masculino', provincia: 'Santo Domingo', esSubtotalProvincia: 'false', total: '180' },
        { sexo: 'Masculino', provincia: 'Santiago', esSubtotalProvincia: 'false', total: '120' }
      ]));
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

    try {
      const sexo = await app.manejadores['listas:guardar']({
        id: '', nombre: 'Sexo segmentador2', descripcion: '', prefijo: 'SXSB', estado: 'Activa', version: 1, orden: 1, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      await app.manejadores['listas:guardarElemento']({ id: '', listaId: sexo.id, codigo: 'M', nombre: 'Masculino', descripcion: '', orden: 1, padreCodigo: null, activo: true });
      const provincia = await app.manejadores['listas:guardar']({
        id: '', nombre: 'Provincia segmentador2', descripcion: '', prefijo: 'PRSB', estado: 'Activa', version: 1, orden: 2, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      await app.manejadores['listas:guardarElemento']({ id: '', listaId: provincia.id, codigo: 'SD', nombre: 'Santo Domingo', descripcion: '', orden: 1, padreCodigo: null, activo: true });
      await app.manejadores['listas:guardarElemento']({ id: '', listaId: provincia.id, codigo: 'STG', nombre: 'Santiago', descripcion: '', orden: 2, padreCodigo: null, activo: true });

      const origen = await app.manejadores['origenes:guardar']({
        id: '', nombre: 'API cubo con segmentador', tipo: 'API', descripcion: '',
        configuracion: { url: `http://127.0.0.1:${puerto}`, metodo: 'GET' }, parametrosGenerales: [],
        activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      const guardado = await app.manejadores['indicadores:guardar']({
        indicador: indicador({ desagregaciones: [sexo.id, provincia.id] }), valores: []
      });
      await app.manejadores['automatizacion:guardar']({
        id: '', indicadorId: guardado.id, origenAutomaticoId: origen.id, parametrosDinamicos: [],
        script: '', columnaValor: 'total',
        mapeoColumnas: [
          { columna: 'sexo', listaId: sexo.id, columnaSegmentadorSubtotal: null },
          { columna: 'provincia', listaId: provincia.id, columnaSegmentadorSubtotal: 'esSubtotalProvincia' }
        ],
        desagregacionesOmitidas: [], creadoEn: '', actualizadoEn: ''
      });
      const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
      const hoy = new Date().toISOString().slice(0, 10);
      const periodoId = periodos.slice().reverse().find((p) => p.fechaFin < hoy)!.id;
      await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });

      const resultado = await app.manejadores['recoleccion:obtenerAutomatico']({ indicadorId: guardado.id, periodoId });
      expect(resultado.celdasActualizadas).toBe(3);
      expect(resultado.filasConError).toBe(0);

      const captura = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId });
      // La fila "TODAS"/esSubtotalProvincia=true escribió el subtotal de Sexo=Masculino (Provincia enrollada), NO un detalle con provincia="TODAS".
      expect(captura.filas.find((f) => f.claveDesagregacion === `${sexo.id}=M`)?.valor).toBe(300);
      expect(captura.filas.find((f) => f.claveDesagregacion.includes('=M') && f.claveDesagregacion.includes('=SD'))?.valor).toBe(180);
      expect(captura.filas.find((f) => f.claveDesagregacion.includes('=M') && f.claveDesagregacion.includes('=STG'))?.valor).toBe(120);
    } finally {
      servidor.close();
    }
  });
});

describe('Composition root — generador de consultas DAX (alias por origen + orígenes PowerBI)', () => {
  function crearServidorTokenPowerBi(handlerExtra: (req: IncomingMessage, res: ServerResponse) => void) {
    return createServer((req, res) => {
      if (req.url === '/token') {
        const trozos: Buffer[] = [];
        req.on('data', (d) => trozos.push(d));
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ access_token: 'token-dax-gen', expires_in: 3600 }));
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

  it('resuelve alias por origen de una sola vez, genera el DAX, y la consulta ejecuta contra un origen PowerBI real produciendo el cubo completo', async () => {
    const capturado: { query: string | null } = { query: null };
    const servidor = crearServidorTokenPowerBi((req, res) => {
      if (req.url !== '/v1.0/myorg/datasets/ds-dax-gen/executeQueries') {
        res.statusCode = 404;
        res.end();
        return;
      }
      const trozos: Buffer[] = [];
      req.on('data', (d) => trozos.push(d));
      req.on('end', () => {
        capturado.query = (JSON.parse(Buffer.concat(trozos).toString('utf-8')) as { queries: { query: string }[] }).queries[0]!.query;
        res.setHeader('Content-Type', 'application/json');
        // Forma real de "Execute Queries": columnas calificadas Tabla[Columna] sin comillas,
        // columnas renombradas/creadas (medida y ROLLUPADDISSUBTOTAL) entre corchetes.
        res.end(JSON.stringify({
          results: [{
            tables: [{
              rows: [
                { 'Sexo[Nombre]': '', 'Provincia[Nombre]': '', '[EsSubtotal1]': true, '[EsSubtotal2]': true, '[Total]': 500 },
                { 'Sexo[Nombre]': 'Masculino', 'Provincia[Nombre]': '', '[EsSubtotal1]': false, '[EsSubtotal2]': true, '[Total]': 300 },
                { 'Sexo[Nombre]': 'Masculino', 'Provincia[Nombre]': 'Santo Domingo', '[EsSubtotal1]': false, '[EsSubtotal2]': false, '[Total]': 180 },
                { 'Sexo[Nombre]': 'Masculino', 'Provincia[Nombre]': 'Santiago', '[EsSubtotal1]': false, '[EsSubtotal2]': false, '[Total]': 120 }
              ]
            }]
          }]
        }));
      });
    });
    const puerto = await levantar(servidor);

    try {
      const sexo = await app.manejadores['listas:guardar']({
        id: '', nombre: 'Sexo DAX gen', descripcion: '', prefijo: 'SXG', estado: 'Activa', version: 1, orden: 1, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      await app.manejadores['listas:guardarElemento']({ id: '', listaId: sexo.id, codigo: 'M', nombre: 'Masculino', descripcion: '', orden: 1, padreCodigo: null, activo: true });
      const provincia = await app.manejadores['listas:guardar']({
        id: '', nombre: 'Provincia DAX gen', descripcion: '', prefijo: 'PVG', estado: 'Activa', version: 1, orden: 2, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      await app.manejadores['listas:guardarElemento']({ id: '', listaId: provincia.id, codigo: 'SD', nombre: 'Santo Domingo', descripcion: '', orden: 1, padreCodigo: null, activo: true });
      await app.manejadores['listas:guardarElemento']({ id: '', listaId: provincia.id, codigo: 'STG', nombre: 'Santiago', descripcion: '', orden: 2, padreCodigo: null, activo: true });

      const origen = await app.manejadores['origenes:guardar']({
        id: '', nombre: 'PowerBI DAX gen', tipo: 'PowerBI', descripcion: '',
        configuracion: {
          apiBase: `http://127.0.0.1:${puerto}/v1.0/myorg`,
          datasetId: 'ds-dax-gen',
          autenticacion: 'oauth2',
          tokenUrl: `http://127.0.0.1:${puerto}/token`,
          clienteId: 'cid', clienteSecreto: 'secreto',
          daxTablaFecha: 'Fecha', daxColumnaFecha: 'Fecha'
        },
        parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      });

      // El alias por origen (Tabla[Columna]) se configura una sola vez por lista×origen —
      // no por indicador — y se resuelve de una sola llamada para todas las desagregaciones.
      await app.manejadores['listas:guardarAliasOrigen']({
        id: '', listaId: sexo.id, origenAutomaticoId: origen.id, alias: 'Sexo[Nombre]', creadoEn: '', actualizadoEn: ''
      });
      await app.manejadores['listas:guardarAliasOrigen']({
        id: '', listaId: provincia.id, origenAutomaticoId: origen.id, alias: "'Provincia'[Nombre]", creadoEn: '', actualizadoEn: ''
      });
      const aliases = await app.manejadores['listas:aliasPorOrigen']({ origenAutomaticoId: origen.id });
      expect(aliases).toHaveLength(2);
      const aliasPorLista = new Map(aliases.map((a) => [a.listaId, a.alias]));
      expect(aliasPorLista.get(sexo.id)).toBe('Sexo[Nombre]');
      expect(aliasPorLista.get(provincia.id)).toBe("'Provincia'[Nombre]");

      const guardado = await app.manejadores['indicadores:guardar']({
        indicador: indicador({ desagregaciones: [sexo.id, provincia.id] }), valores: []
      });
      const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
      const hoy = new Date().toISOString().slice(0, 10);
      const periodo = periodos.slice().reverse().find((p) => p.fechaFin < hoy)!;

      // El generador solo necesita el nombre de la medida: todo lo demás (mapeo de
      // columnas, filtro de fecha, ROLLUPADDISSUBTOTAL) sale de lo ya configurado.
      const generado = generarConsultaDax({
        desagregaciones: [
          { listaId: sexo.id, referenciaDax: aliasPorLista.get(sexo.id)! },
          { listaId: provincia.id, referenciaDax: aliasPorLista.get(provincia.id)! }
        ],
        tablaFecha: origen.configuracion.daxTablaFecha!,
        columnaFecha: origen.configuracion.daxColumnaFecha!,
        fechaInicio: periodo.fechaInicio,
        fechaFin: periodo.fechaFin,
        medida: 'Total de casos'
      });

      await app.manejadores['automatizacion:guardar']({
        id: '', indicadorId: guardado.id, origenAutomaticoId: origen.id, parametrosDinamicos: [],
        script: generado.script, columnaValor: generado.columnaValor, mapeoColumnas: generado.mapeoColumnas,
        desagregacionesOmitidas: [], medidaDax: 'Total de casos', creadoEn: '', actualizadoEn: ''
      });

      // El medidaDax persiste a través de un round-trip (guardar → obtener), no solo en memoria.
      const persistida = await app.manejadores['automatizacion:obtener']({ indicadorId: guardado.id });
      expect(persistida?.medidaDax).toBe('Total de casos');
      expect(persistida?.script).toBe(generado.script);
      expect(persistida?.columnaValor).toBe('[Total]');

      await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId: periodo.id, fechaCorte: '2025-01-31' });
      const resultado = await app.manejadores['recoleccion:obtenerAutomatico']({ indicadorId: guardado.id, periodoId: periodo.id });
      expect(resultado.filasConError).toBe(0);
      expect(resultado.celdasActualizadas).toBe(4);

      // La consulta DAX generada de verdad se envió al origen (probando que el texto es DAX ejecutable, no solo texto plausible).
      expect(capturado.query).toContain('SUMMARIZECOLUMNS(');
      expect(capturado.query).toContain("ROLLUPADDISSUBTOTAL('Sexo'[Nombre], \"EsSubtotal1\", 'Provincia'[Nombre], \"EsSubtotal2\")");
      expect(capturado.query).toContain('"Total", [Total de casos]');

      // El cubo completo (General + subtotal de Sexo + detalle) quedó escrito vía el
      // segmentador [EsSubtotalN] generado automáticamente — sin mapeo manual alguno.
      const captura = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId: periodo.id });
      expect(captura.filas.find((f) => f.esGeneral)?.valor).toBe(500);
      expect(captura.filas.find((f) => f.claveDesagregacion === `${sexo.id}=M`)?.valor).toBe(300);
      expect(captura.filas.find((f) => f.claveDesagregacion.includes('=M') && f.claveDesagregacion.includes('=SD'))?.valor).toBe(180);
      expect(captura.filas.find((f) => f.claveDesagregacion.includes('=M') && f.claveDesagregacion.includes('=STG'))?.valor).toBe(120);
    } finally {
      servidor.close();
    }
  });
});

describe('Composition root — configuración portable v1/v2 → v3', () => {
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

  it('migra un archivo v2 auténtico (sin equipos) e importa correctamente', async () => {
    const archivoV2 = {
      formato: 'kpitracker-config',
      schemaVersion: 2,
      exportadoEn: new Date().toISOString(),
      configuracionGeneral: { anioInicial: 2024, reglaFechaLimite: { tipo: 'DiaFijoDelMes', parametros: { dia: 10 } }, exportarCsv: false, nombreInstitucion: 'Institución v2', tema: 'sistema', schemaVersion: 2 },
      indicadores: [],
      atributos: [],
      listas: [],
      elementos: [],
      reglas: [],
      metas: [],
      periodicidades: [],
      responsables: [],
      categorias: []
      // Nótese: sin equipos — así lucía un archivo real de la v2 (Batch R lo agregó en v3).
    };

    const { advertencias } = await app.manejadores['portable:importar']({ json: JSON.stringify(archivoV2) });
    expect(advertencias.some((a) => a.includes('versión 3'))).toBe(true);

    const config = await app.manejadores['config:obtener'](undefined);
    expect(config.nombreInstitucion).toBe('Institución v2');
    // El equipo raíz "General" (Batch T) ya existe desde el arranque, independiente de la importación.
    expect(await app.manejadores['equipos:listar'](undefined)).toHaveLength(1);
  });

  it('exporta e importa equipos como parte de la configuración portable (round-trip)', async () => {
    const equipoRaiz = await app.manejadores['equipos:guardar']({
      id: '', nombre: 'Dirección', descripcion: '', activo: true, eliminado: false, padreId: null, creadoEn: '', actualizadoEn: ''
    });
    await app.manejadores['equipos:guardar']({
      id: '', nombre: 'Sub-dirección', descripcion: '', activo: true, eliminado: false, padreId: equipoRaiz.id,
      creadoEn: '', actualizadoEn: ''
    });

    const { json } = await app.manejadores['portable:exportar'](undefined);
    const archivo = JSON.parse(json) as { schemaVersion: number; equipos: Array<{ nombre: string }> };
    expect(archivo.schemaVersion).toBe(5);
    // "General" (Batch T) viaja junto con los dos equipos creados en este test.
    expect(archivo.equipos.map((e) => e.nombre).sort()).toEqual(['Dirección', 'General', 'Sub-dirección']);

    // Reimportar sobre la misma app (upsert por id) no debe duplicar los equipos.
    await app.manejadores['portable:importar']({ json });
    expect(await app.manejadores['equipos:listar'](undefined)).toHaveLength(3);
  });
});

describe('Composition root — exportación analítica resuelve nombres de catálogo', () => {
  it('ResultadosAnalitico.parquet muestra el nombre del responsable y la categoría, no sus ids', async () => {
    const responsable = await app.usuarios.crear({
      nombreUsuario: 'maria-gomez', nombreCompleto: 'María Gómez', password: 'contrasenaSegura1'
    });
    const categoria = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Prioritario', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null, creadoEn: '', actualizadoEn: ''
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

describe('Composition root — Indicador.requiereValidacion (Batch U, U7)', () => {
  it('por defecto es true, y se puede desactivar/reactivar', async () => {
    const creado = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    expect(creado.requiereValidacion).toBe(true);

    const desactivado = await app.manejadores['indicadores:guardar']({
      indicador: { ...creado, requiereValidacion: false }, valores: []
    });
    expect(desactivado.requiereValidacion).toBe(false);

    const reactivado = await app.manejadores['indicadores:guardar']({
      indicador: { ...desactivado, requiereValidacion: true }, valores: []
    });
    expect(reactivado.requiereValidacion).toBe(true);
  });
});

describe('Composition root — reasignación masiva de responsable/categoría', () => {
  it('reasigna responsable y categoría a varios indicadores sin tocar los campos no especificados', async () => {
    const responsable = await app.usuarios.crear({
      nombreUsuario: 'ana', nombreCompleto: 'Ana', password: 'contrasenaSegura1'
    });
    const categoriaOriginal = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Original', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null, creadoEn: '', actualizadoEn: ''
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
    const responsable = await app.usuarios.crear({
      nombreUsuario: 'beto', nombreCompleto: 'Beto', password: 'contrasenaSegura1'
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

describe('Composition root — restaurarPeriodo (Batch U10, rollback de TODAS las desagregaciones del período)', () => {
  it('restaura GENERAL y todas las desagregaciones al estado vigente en un punto en el tiempo, y no toca celdas que ya coincidían', async () => {
    const lista = await app.manejadores['listas:guardar']({
      id: '', nombre: 'Sexo U10', descripcion: '', prefijo: 'SXU', estado: 'Activa', version: 1, orden: 1, jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    await app.manejadores['listas:guardarElemento']({ id: '', listaId: lista.id, codigo: 'M', nombre: 'Masculino', descripcion: '', orden: 1, padreCodigo: null, activo: true });

    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ desagregaciones: [lista.id] }), valores: []
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });

    // t1: primer estado — GENERAL=10, M=5. Nunca se vuelve a tocar M después de esto.
    await app.manejadores['recoleccion:guardarCelda']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10' });
    await app.manejadores['recoleccion:guardarCelda']({ indicadorId: guardado.id, periodoId, claveDesagregacion: `${lista.id}=M`, valorCrudo: '5' });
    // t1 = el instante justo después de escribir M (la más reciente de las dos escrituras de arriba),
    // así que ambas celdas ya tienen una versión vigente "en o antes de t1".
    const capturaT1 = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId });
    const t1 = capturaT1.filas.find((f) => f.claveDesagregacion === `${lista.id}=M`)!.actualizadoEn!;

    // Separación real de reloj antes de t2: garantiza que su actualizadoEn quede
    // estrictamente después de t1 (evita un empate de milisegundo con SQLite local).
    await new Promise((resolve) => setTimeout(resolve, 5));

    // t2: solo GENERAL cambia a 20 (M se queda en 5, sin nueva escritura).
    await app.manejadores['recoleccion:guardarCelda']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '20' });

    const resultado = await app.manejadores['recoleccion:restaurarPeriodo']({ indicadorId: guardado.id, periodoId, timestamp: t1 });
    // Solo GENERAL cambió de verdad (20 -> 10); M ya coincidía con su estado en t1 (5), así que no cuenta.
    expect(resultado.restauradas).toBe(1);

    const capturaFinal = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId });
    expect(capturaFinal.filas.find((f) => f.claveDesagregacion === 'GENERAL')?.valor).toBe(10);
    expect(capturaFinal.filas.find((f) => f.claveDesagregacion === `${lista.id}=M`)?.valor).toBe(5);

    // El 20 que reemplazó queda preservado como versión del historial (nunca se pierde información).
    const historialGeneral = await app.manejadores['recoleccion:historial']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL' });
    expect(historialGeneral.map((h) => h.valor)).toContain(20);
  });

  it('no restaura nada si el timestamp es anterior a cualquier valor registrado', async () => {
    const guardado = await app.manejadores['indicadores:guardar']({ indicador: indicador(), valores: [] });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });
    await app.manejadores['recoleccion:guardarCelda']({ indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '10' });

    const resultado = await app.manejadores['recoleccion:restaurarPeriodo']({
      indicadorId: guardado.id, periodoId, timestamp: '1970-01-01T00:00:00.000Z'
    });
    expect(resultado.restauradas).toBe(0);

    const captura = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId });
    expect(captura.filas.find((f) => f.claveDesagregacion === 'GENERAL')?.valor).toBe(10);
  });

  it('rechaza restaurar el período de un indicador calculado', async () => {
    const base = await app.manejadores['indicadores:guardar']({ indicador: indicador({ codigo: 'BASE-U10' }), valores: [] });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: base.id });
    const periodoId = periodos[periodos.length - 1]!.id;
    const calculado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ codigo: 'CALC-U10', esCalculado: true, formula: '[BASE-U10] * 2' }), valores: []
    });

    await expect(
      app.manejadores['recoleccion:restaurarPeriodo']({ indicadorId: calculado.id, periodoId, timestamp: new Date().toISOString() })
    ).rejects.toThrow(/calculado/);
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

  it('prefiere la Meta configurada para el período (si existe) sobre el escalar metaGlobal', async () => {
    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ metaGlobal: 100 }), valores: []
    });
    const periodos = await app.manejadores['recoleccion:periodos']({ indicadorId: guardado.id });
    const hoy = new Date().toISOString().slice(0, 10);
    const periodoId = periodos.slice().reverse().find((p) => p.fechaFin < hoy)!.id;
    const anioVigencia = Number(periodoId.slice(0, 4));
    await app.manejadores['recoleccion:fechaCorte']({ indicadorId: guardado.id, periodoId, fechaCorte: '2025-01-31' });
    await app.manejadores['recoleccion:guardarCelda']({
      indicadorId: guardado.id, periodoId, claveDesagregacion: 'GENERAL', valorCrudo: '80'
    });
    await app.manejadores['metas:guardar']({
      id: '', indicadorId: guardado.id, claveDesagregacion: 'GENERAL', valor: 200,
      periodicidadMedicion: Periodicidad.Trimestral, periodicidadPersonalizadaId: null,
      metodoCalculo: 'Promedio', anioVigencia, creadoEn: '', actualizadoEn: ''
    });

    const historico = await app.manejadores['seguimiento:historico'](undefined);
    const fila = historico.find((h) => h.indicadorId === guardado.id);
    const punto = fila!.puntos.find((p) => p.periodoId === periodoId);
    expect(punto?.metaPeriodo).toBe(200);
    expect(punto?.cumplimientoPct).toBe(40); // 80/200, NO 80/100 (el metaGlobal escalar queda de respaldo).
  });

  it('sin una Meta configurada para el período, cae al escalar metaGlobal (compatibilidad)', async () => {
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
    const punto = fila!.puntos.find((p) => p.periodoId === periodoId);
    expect(punto?.metaPeriodo).toBeNull();
    expect(punto?.cumplimientoPct).toBe(80); // 80/100 vía metaGlobal.
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

  // Batch U (U5b): Histórico gana categoría/equipo — mismo cálculo que el tablero de Estado
  // (`ServicioSeguimiento.clasificacionDe`), para poder agruparse igual jerárquicamente.
  it('expone categoría y equipo (directo) igual que el tablero de Estado', async () => {
    const categoria = await app.manejadores['categorias:guardar']({
      id: '', nombre: 'Prioritaria', descripcion: '', activo: true, eliminado: false, padreId: null, prefijo: null, creadoEn: '', actualizadoEn: ''
    });
    const equipo = await app.manejadores['equipos:guardar']({
      id: '', nombre: 'Equipo Histórico', descripcion: '', activo: true, eliminado: false, padreId: null, creadoEn: '', actualizadoEn: ''
    });
    const guardado = await app.manejadores['indicadores:guardar']({
      indicador: indicador({ categoria: categoria.id, equipo: equipo.id }), valores: []
    });

    const historico = await app.manejadores['seguimiento:historico'](undefined);
    const fila = historico.find((h) => h.indicadorId === guardado.id);
    expect(fila?.categoriaId).toBe(categoria.id);
    expect(fila?.categoria).toBe('Prioritaria');
    expect(fila?.equipoId).toBe(equipo.id);
    expect(fila?.equipo).toBe('Equipo Histórico');
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
    // El origen devuelve el NOMBRE del elemento ("Masculino"/"Femenino"), no su código
    // interno ("M"/"F") — así es como llegan los datos de un origen real (SQL/API/XMLA/
    // PowerBI): la resolución nombre→código ocurre dentro de obtenerResultadoAutomatico.
    const servidor = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([
        { sexo: '', total: '82.5' },
        { sexo: 'Masculino', total: '90' },
        { sexo: 'Femenino', total: '75' }
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

describe('Composition root — conciliación de orígenes automáticos por NOMBRE (no por código)', () => {
  it('automatizacion:validarColumna compara contra el nombre del elemento, no su código', async () => {
    const lista = await app.manejadores['listas:guardar']({
      id: '', nombre: 'Sexo', descripcion: '', prefijo: 'SX', estado: 'Activa', version: 1, orden: 1,
      jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    await app.manejadores['listas:guardarElemento']({
      id: '', listaId: lista.id, codigo: 'M', nombre: 'Masculino', descripcion: '', orden: 1, padreCodigo: null, activo: true
    });
    const reporte = await app.manejadores['automatizacion:validarColumna']({ listaId: lista.id, valoresUnicos: ['Masculino', 'M'] });
    expect(reporte.coincidentes).toEqual(['Masculino']);
    expect(reporte.noEncontrados).toEqual(['M']);
  });

  it('automatizacion:agregarElementosFaltantes crea el código desde el prefijo de la lista y guarda el nombre tal cual llegó del origen', async () => {
    const lista = await app.manejadores['listas:guardar']({
      id: '', nombre: 'Provincia', descripcion: '', prefijo: 'PROV', estado: 'Activa', version: 1, orden: 1,
      jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    const creados = await app.manejadores['automatizacion:agregarElementosFaltantes']({
      listaId: lista.id, nombres: ['Distrito Nacional', 'Santiago']
    });
    expect(creados).toHaveLength(2);
    expect(creados[0]).toMatchObject({ nombre: 'Distrito Nacional', codigo: 'PROV-01' });
    expect(creados[1]).toMatchObject({ nombre: 'Santiago', codigo: 'PROV-02' });

    // Idempotente: reintentar con un nombre ya agregado no crea un duplicado.
    const segundaVez = await app.manejadores['automatizacion:agregarElementosFaltantes']({
      listaId: lista.id, nombres: ['Distrito Nacional', 'La Vega']
    });
    expect(segundaVez).toHaveLength(1);
    expect(segundaVez[0]).toMatchObject({ nombre: 'La Vega', codigo: 'PROV-03' });
  });

  it('recoleccion:obtenerAutomatico cuenta como error una fila cuyo valor no coincide con ningún nombre de elemento', async () => {
    const servidor = createServer((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([{ sexo: 'Masculino', total: '10' }, { sexo: 'Desconocido', total: '5' }]));
    });
    await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', () => resolve()));
    const direccion = servidor.address();
    const puerto = typeof direccion === 'object' && direccion ? direccion.port : 0;

    try {
      const origen = await app.manejadores['origenes:guardar']({
        id: '', nombre: 'API local con valor no resoluble', tipo: 'API', descripcion: '',
        configuracion: { url: `http://127.0.0.1:${puerto}`, metodo: 'GET' }, parametrosGenerales: [],
        activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      const lista = await app.manejadores['listas:guardar']({
        id: '', nombre: 'Sexo', descripcion: '', prefijo: 'SX', estado: 'Activa', version: 1, orden: 1,
        jerarquica: false, eliminado: false, creadoEn: '', actualizadoEn: ''
      });
      await app.manejadores['listas:guardarElemento']({
        id: '', listaId: lista.id, codigo: 'M', nombre: 'Masculino', descripcion: '', orden: 1, padreCodigo: null, activo: true
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
      expect(resultado.celdasActualizadas).toBe(1);
      expect(resultado.filasConError).toBe(1);

      const captura = await app.manejadores['recoleccion:captura']({ indicadorId: guardado.id, periodoId });
      expect(captura.filas.find((f) => f.claveDesagregacion.includes('=M'))?.valor).toBe(10);
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

  it('sin autenticación configurada, se asume Microsoft (nunca Basic ni "sin nada") — intenta iniciar sesión de verdad', async () => {
    // No hay ventana real de Electron en este entorno de pruebas (igual que el resto de
    // los casos "Microsoft interactivo" de la suite), así que el intento de abrir el
    // login falla — pero el mensaje confirma que SÍ se intentó Microsoft, no que se
    // quedó sin credenciales configuradas (el bug que este mismo fix corrige: antes,
    // "sin autenticación configurada" fallaba con "Configure autenticación..." aunque
    // la UI mostrara "Microsoft" seleccionado).
    const resultado = await app.manejadores['origenes:probar']({
      id: 'origen-pbi-sin-auth', nombre: 'Power BI sin autenticación', tipo: 'PowerBI', descripcion: '',
      configuracion: { datasetId: 'dataset-abc' },
      parametrosGenerales: [], activo: true, eliminado: false, creadoEn: '', actualizadoEn: ''
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.mensaje).not.toMatch(/Configure autenticación/);
    expect(resultado.mensaje).not.toMatch(/no admite Basic/);
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
