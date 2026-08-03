import { crearInfraestructura } from '@infrastructure/bootstrap';
import type { Infraestructura } from '@infrastructure/bootstrap';
import { crearRegistroReglasFechaLimite, crearRegistroTiposBase } from '@domain/index';
import type { ContextoAplicacion } from '@application/use-cases/base';
import { ServicioConfiguracion } from '@application/use-cases/ServicioConfiguracion';
import {
  ServicioAtributos, ServicioIndicadores, ServicioListas, ServicioMetas, ServicioReglas
} from '@application/use-cases/ServicioCatalogos';
import { ServicioRecoleccion } from '@application/use-cases/ServicioRecoleccion';
import { ServicioSeguimiento } from '@application/use-cases/ServicioSeguimiento';
import type { CanalesIpc, NombreCanal } from '@shared/ipc';

export interface Aplicacion {
  infra: Infraestructura;
  manejadores: { [C in NombreCanal]: (payload: CanalesIpc[C]['req']) => Promise<CanalesIpc[C]['res']> };
  cerrar(): Promise<void>;
}

/**
 * Composition root: única pieza que conoce todas las implementaciones
 * concretas y las cablea (inyección de dependencias manual y explícita).
 * Devuelve el mapa completo de manejadores IPC tipados.
 */
export async function componerAplicacion(dataDir: string): Promise<Aplicacion> {
  const infra = await crearInfraestructura(dataDir);
  const tipos = crearRegistroTiposBase();
  const reglasFechaLimite = crearRegistroReglasFechaLimite();

  const ctx: ContextoAplicacion = {
    auditoria: infra.auditoria,
    reloj: infra.reloj,
    ids: infra.ids,
    exportacion: infra.exportacion
  };

  const configuracion = new ServicioConfiguracion(ctx, infra.configuracion, reglasFechaLimite);
  const indicadores = new ServicioIndicadores(ctx, infra.indicadores);
  const atributos = new ServicioAtributos(ctx, infra.atributos);
  const listas = new ServicioListas(ctx, infra.listas);
  const metas = new ServicioMetas(ctx, infra.metas);
  const reglas = new ServicioReglas(ctx, infra.reglas);
  const recoleccion = new ServicioRecoleccion(ctx, infra.indicadores, infra.listas, infra.resultados, infra.configuracion, tipos);
  const seguimiento = new ServicioSeguimiento(ctx, infra.indicadores, infra.listas, infra.resultados, infra.configuracion, reglasFechaLimite);

  const manejadores: Aplicacion['manejadores'] = {
    'config:obtener': () => configuracion.obtener(),
    'config:guardar': (config) => configuracion.guardar(config),
    'config:reglasFechaLimite': async () => configuracion.reglasDisponibles(),

    'indicadores:listar': () => indicadores.listar(),
    'indicadores:obtener': ({ id }) => indicadores.obtener(id),
    'indicadores:guardar': (indicador) => indicadores.guardar(indicador),
    'indicadores:eliminar': ({ id }) => indicadores.eliminar(id),

    'atributos:listar': (payload) => atributos.listar(payload?.entidad),
    'atributos:guardar': (atributo) => atributos.guardar(atributo),
    'atributos:eliminar': ({ id }) => atributos.eliminar(id),
    'atributos:valores': ({ entidadTipo, entidadId }) => atributos.obtenerValores(entidadTipo, entidadId),
    'atributos:guardarValor': (valor) => atributos.guardarValor(valor),

    'listas:listar': () => listas.listar(),
    'listas:guardar': (lista) => listas.guardar(lista),
    'listas:eliminar': ({ id }) => listas.eliminar(id),
    'listas:elementos': ({ listaId }) => listas.listarElementos(listaId),
    'listas:guardarElemento': (elemento) => listas.guardarElemento(elemento),
    'listas:eliminarElemento': ({ id }) => listas.eliminarElemento(id),

    'metas:listar': ({ indicadorId }) => metas.listarPorIndicador(indicadorId),
    'metas:guardar': (meta) => metas.guardar(meta),
    'metas:eliminar': ({ id }) => metas.eliminar(id),

    'reglas:listar': (payload) => reglas.listar(payload?.entidad),
    'reglas:guardar': (regla) => reglas.guardar(regla),
    'reglas:eliminar': ({ id }) => reglas.eliminar(id),

    'recoleccion:periodos': ({ indicadorId }) => recoleccion.periodosDisponibles(indicadorId),
    'recoleccion:captura': ({ indicadorId, periodoId }) => recoleccion.obtenerCaptura(indicadorId, periodoId),
    'recoleccion:guardarCelda': ({ indicadorId, periodoId, claveDesagregacion, valorCrudo, observacion }) =>
      recoleccion.guardarCelda(indicadorId, periodoId, claveDesagregacion, valorCrudo, observacion ?? null),
    'recoleccion:fechaCorte': ({ indicadorId, periodoId, fechaCorte }) =>
      recoleccion.establecerFechaCorte(indicadorId, periodoId, fechaCorte),
    'recoleccion:exclusion': ({ indicadorId, periodoId, listaId, excluir }) =>
      recoleccion.alternarExclusion(indicadorId, periodoId, listaId, excluir),

    'seguimiento:tablero': () => seguimiento.tablero(),
    'seguimiento:detalle': ({ indicadorId }) => seguimiento.detalle(indicadorId),

    'exportacion:regenerar': async () => {
      await infra.exportacion.regenerar();
      return { ruta: infra.exportacion.rutaExportacion() };
    },
    'exportacion:ruta': async () => ({ ruta: infra.exportacion.rutaExportacion() }),

    'auditoria:consultar': (filtro) => infra.auditoria.consultar(filtro ?? {}),

    'portable:exportar': async () => ({ json: await infra.configPortable.exportar() }),
    'portable:importar': ({ json }) => infra.configPortable.importar(json),

    'tipos:listar': async () =>
      tipos.listar().map((t) => ({ tipo: String(t.tipo), etiqueta: t.etiqueta, editorHint: t.editorHint }))
  };

  return {
    infra,
    manejadores,
    cerrar: () => infra.cerrar()
  };
}
