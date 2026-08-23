import type { Infraestructura } from '@infrastructure/bootstrap';
import type { ContextoAplicacion } from '@application/use-cases/base';
import type { CanalesIpc, CanalLocal, NombreCanal } from '@shared/ipc';
import { crearRegistroReglasFechaLimite, crearRegistroTiposBase } from '@domain/index';
import { ServicioConfiguracion } from '@application/use-cases/ServicioConfiguracion';
import {
  ServicioAtributos, ServicioIndicadores, ServicioListas, ServicioMetas, ServicioReglas
} from '@application/use-cases/ServicioCatalogos';
import { ServicioCatalogoGenerico } from '@application/use-cases/ServicioCatalogoGenerico';
import { referenciasDeCategoria, referenciasDeOrigen, referenciasDeResponsable } from '@application/use-cases/referencias';
import { ServicioPeriodicidades } from '@application/use-cases/ServicioPeriodicidades';
import { ServicioRecoleccion } from '@application/use-cases/ServicioRecoleccion';
import { ServicioSeguimiento } from '@application/use-cases/ServicioSeguimiento';
import { ServicioAdjuntos } from '@application/use-cases/ServicioAdjuntos';
import { ServicioAutomatizacionIndicador } from '@application/use-cases/ServicioAutomatizacionIndicador';
import { LIMITE_FILAS_PRUEBA_ORIGEN } from '@shared/ipc';

/**
 * Punto de composición compartido entre el proceso principal de Electron
 * (`src/main/composicion.ts`) y el servidor Express (`src/server/`): arma
 * los ~15 servicios de aplicación sobre una `Infraestructura` YA construida
 * (con su propio `IArchivoService`, distinto en cada entorno) y devuelve el
 * mapa de manejadores por canal, más las pocas instancias de servicio que
 * las rutas REST necesitan invocar directamente (ver `servicios` abajo).
 *
 * Deliberadamente NO importa nada de Electron ni de Node más allá de lo que
 * ya traen los casos de uso — así ambos composition roots pueden compartirlo
 * sin que el servidor arrastre `electron` a su grafo de módulos.
 */
export interface Aplicacion {
  infra: Infraestructura;
  manejadores: {
    [C in Exclude<NombreCanal, CanalLocal>]: (payload: CanalesIpc[C]['req']) => Promise<CanalesIpc[C]['res']>;
  };
  /**
   * Instancias de servicio que las rutas REST (fuera de tRPC, ver
   * `src/server/rest/`) necesitan invocar directamente porque el flujo web
   * no calza con el manejador IPC original (p. ej. `adjuntos:subir` asumía
   * un diálogo nativo — la ruta REST usa `subirDesdeArchivo` en su lugar).
   */
  servicios: {
    adjuntos: ServicioAdjuntos;
  };
  cerrar(): Promise<void>;
}

/** Arma los servicios de aplicación y el mapa de manejadores sobre una `Infraestructura` ya creada. */
export function componerManejadores(infra: Infraestructura): Pick<Aplicacion, 'manejadores' | 'servicios'> {
  const tipos = crearRegistroTiposBase();
  const reglasFechaLimite = crearRegistroReglasFechaLimite();

  const ctx: ContextoAplicacion = {
    auditoria: infra.auditoria,
    reloj: infra.reloj,
    ids: infra.ids,
    exportacion: infra.exportacion
  };

  const configuracion = new ServicioConfiguracion(ctx, infra.configuracion, reglasFechaLimite);
  const indicadores = new ServicioIndicadores(ctx, infra.indicadores, infra.atributos, infra.reglas, infra.periodicidades, tipos);
  const atributos = new ServicioAtributos(ctx, infra.atributos, infra.reglas, infra.automatizaciones, infra.indicadores);
  const listas = new ServicioListas(
    ctx, infra.listas, infra.aliasDesagregacionOrigen, infra.atributos, infra.indicadores, infra.automatizaciones
  );
  const metas = new ServicioMetas(ctx, infra.metas, infra.periodicidades);
  const reglas = new ServicioReglas(ctx, infra.reglas);
  const periodicidades = new ServicioPeriodicidades(ctx, infra.periodicidades);
  const responsables = new ServicioCatalogoGenerico(
    ctx, infra.responsables, 'Responsable', (id) => referenciasDeResponsable({ indicadores: infra.indicadores }, id)
  );
  const categorias = new ServicioCatalogoGenerico(
    ctx, infra.categorias, 'Categoria', (id) => referenciasDeCategoria({ indicadores: infra.indicadores }, id)
  );
  const origenesAutomaticos = new ServicioCatalogoGenerico(
    ctx, infra.origenesAutomaticos, 'OrigenAutomatico',
    (id) => referenciasDeOrigen(
      { automatizaciones: infra.automatizaciones, aliasDesagregacionOrigen: infra.aliasDesagregacionOrigen, indicadores: infra.indicadores },
      id
    )
  );
  const recoleccion = new ServicioRecoleccion(
    ctx, infra.indicadores, infra.listas, infra.resultados, infra.configuracion, infra.periodicidades, infra.reglas, tipos,
    infra.automatizaciones, infra.origenesAutomaticos, infra.atributos, infra.conectorOrigen
  );
  const seguimiento = new ServicioSeguimiento(
    ctx, infra.indicadores, infra.listas, infra.resultados, infra.configuracion,
    infra.periodicidades, infra.responsables, infra.categorias, infra.atributos, reglasFechaLimite
  );
  const adjuntos = new ServicioAdjuntos(ctx, infra.adjuntos, infra.archivos);
  const automatizacion = new ServicioAutomatizacionIndicador(
    ctx, infra.automatizaciones, infra.indicadores, infra.origenesAutomaticos, infra.atributos,
    infra.listas, infra.periodicidades, infra.conectorOrigen
  );

  const manejadores: Aplicacion['manejadores'] = {
    'config:obtener': () => configuracion.obtener(),
    'config:guardar': (config) => configuracion.guardar(config),
    'config:reglasFechaLimite': async () => configuracion.reglasDisponibles(),

    'indicadores:listar': () => indicadores.listar(),
    'indicadores:obtener': ({ id }) => indicadores.obtener(id),
    'indicadores:guardar': (input) => indicadores.guardar(input),
    'indicadores:eliminar': ({ id }) => indicadores.eliminar(id),
    'indicadores:reasignarMasivo': ({ ids, responsable, categoria }) =>
      indicadores.reasignarMasivo(ids, { responsable, categoria }),
    'indicadores:importarExcel': ({ filas, mapeo }) => indicadores.importarExcel(filas, mapeo),

    'atributos:listar': (payload) => atributos.listar(payload?.entidad, payload?.incluirEliminados),
    'atributos:guardar': (atributo) => atributos.guardar(atributo),
    'atributos:eliminar': ({ id }) => atributos.eliminar(id),
    'atributos:restaurar': ({ id }) => atributos.restaurar(id),
    'atributos:valores': ({ entidadTipo, entidadId }) => atributos.obtenerValores(entidadTipo, entidadId),
    'atributos:guardarValor': (valor) => atributos.guardarValor(valor),

    'listas:listar': (payload) => listas.listar(payload?.incluirEliminados),
    'listas:guardar': (lista) => listas.guardar(lista),
    'listas:eliminar': ({ id }) => listas.eliminar(id),
    'listas:restaurar': ({ id }) => listas.restaurar(id),
    'listas:elementos': ({ listaId }) => listas.listarElementos(listaId),
    'listas:guardarElemento': (elemento) => listas.guardarElemento(elemento),
    'listas:eliminarElemento': ({ id }) => listas.eliminarElemento(id),

    'metas:listar': ({ indicadorId }) => metas.listarPorIndicador(indicadorId),
    'metas:guardar': (meta) => metas.guardar(meta),
    'metas:eliminar': ({ id }) => metas.eliminar(id),

    'reglas:listar': (payload) => reglas.listar(payload?.entidad, payload?.incluirEliminados),
    'reglas:guardar': (regla) => reglas.guardar(regla),
    'reglas:eliminar': ({ id }) => reglas.eliminar(id),
    'reglas:restaurar': ({ id }) => reglas.restaurar(id),

    'periodicidades:listar': () => periodicidades.listar(),
    'periodicidades:guardar': (definicion) => periodicidades.guardar(definicion),
    'periodicidades:eliminar': ({ id }) => periodicidades.eliminar(id),

    'responsables:listar': (payload) => responsables.listar(payload?.incluirEliminados),
    'responsables:guardar': (responsable) => responsables.guardar(responsable),
    'responsables:eliminar': ({ id }) => responsables.eliminar(id),
    'responsables:restaurar': ({ id }) => responsables.restaurar(id),

    'categorias:listar': (payload) => categorias.listar(payload?.incluirEliminados),
    'categorias:guardar': (categoria) => categorias.guardar(categoria),
    'categorias:eliminar': ({ id }) => categorias.eliminar(id),
    'categorias:restaurar': ({ id }) => categorias.restaurar(id),

    'origenes:listar': (payload) => origenesAutomaticos.listar(payload?.incluirEliminados),
    'origenes:guardar': (origen) => origenesAutomaticos.guardar(origen),
    'origenes:eliminar': ({ id }) => origenesAutomaticos.eliminar(id),
    'origenes:restaurar': ({ id }) => origenesAutomaticos.restaurar(id),
    'origenes:probar': (origen) => infra.conectorOrigen.probar(origen),
    'origenes:probarCodigo': async ({ origen, script }) => {
      const r = await infra.conectorOrigen.ejecutar(origen, script);
      return {
        columnas: r.columnas,
        filas: r.filas.slice(0, LIMITE_FILAS_PRUEBA_ORIGEN),
        totalFilas: r.filas.length,
        truncado: r.filas.length > LIMITE_FILAS_PRUEBA_ORIGEN
      };
    },

    'listas:aliasOrigen': ({ listaId }) => listas.listarAliasOrigen(listaId),
    'listas:aliasPorOrigen': ({ origenAutomaticoId }) => listas.listarAliasPorOrigen(origenAutomaticoId),
    'listas:guardarAliasOrigen': (alias) => listas.guardarAliasOrigen(alias),
    'listas:eliminarAliasOrigen': ({ id }) => listas.eliminarAliasOrigen(id),

    'automatizacion:obtener': ({ indicadorId }) => automatizacion.obtener(indicadorId),
    'automatizacion:guardar': (config) => automatizacion.guardar(config),
    'automatizacion:eliminar': ({ indicadorId }) => automatizacion.eliminar(indicadorId),
    'automatizacion:ejecutarPrueba': ({ indicadorId, periodoId, origenAutomaticoId, parametrosDinamicos, script }) =>
      automatizacion.ejecutarPrueba(indicadorId, periodoId, origenAutomaticoId, parametrosDinamicos, script),
    'automatizacion:validarColumna': ({ listaId, valoresUnicos }) => automatizacion.validarColumna(listaId, valoresUnicos),
    'automatizacion:agregarElementosFaltantes': ({ listaId, nombres }) => automatizacion.agregarElementosFaltantes(listaId, nombres),

    'recoleccion:periodos': ({ indicadorId }) => recoleccion.periodosDisponibles(indicadorId),
    'recoleccion:captura': ({ indicadorId, periodoId }) => recoleccion.obtenerCaptura(indicadorId, periodoId),
    'recoleccion:guardarCelda': ({ indicadorId, periodoId, claveDesagregacion, valorCrudo, observacion }) =>
      recoleccion.guardarCelda(indicadorId, periodoId, claveDesagregacion, valorCrudo, observacion ?? null),
    'recoleccion:fechaCorte': ({ indicadorId, periodoId, fechaCorte }) =>
      recoleccion.establecerFechaCorte(indicadorId, periodoId, fechaCorte),
    'recoleccion:comentario': ({ indicadorId, periodoId, comentario }) =>
      recoleccion.establecerComentario(indicadorId, periodoId, comentario),
    'recoleccion:exclusion': ({ indicadorId, periodoId, listaId, excluir }) =>
      recoleccion.alternarExclusion(indicadorId, periodoId, listaId, excluir),
    'recoleccion:historial': ({ indicadorId, periodoId, claveDesagregacion }) =>
      recoleccion.historialCelda(indicadorId, periodoId, claveDesagregacion),
    'recoleccion:restaurarVersion': ({ indicadorId, periodoId, claveDesagregacion, version }) =>
      recoleccion.restaurarVersion(indicadorId, periodoId, claveDesagregacion, version),
    'recoleccion:obtenerAutomatico': ({ indicadorId, periodoId }) =>
      recoleccion.obtenerResultadoAutomatico(indicadorId, periodoId),

    'seguimiento:tablero': () => seguimiento.tablero(),
    'seguimiento:detalle': ({ indicadorId }) => seguimiento.detalle(indicadorId),
    'seguimiento:historico': () => seguimiento.historico(),

    'exportacion:regenerar': async () => {
      await infra.exportacion.regenerar();
      return { ruta: infra.exportacion.rutaExportacion() };
    },
    'exportacion:ruta': async () => ({ ruta: infra.exportacion.rutaExportacion() }),

    'auditoria:consultar': (filtro) => infra.auditoria.consultar(filtro ?? {}),

    'portable:exportar': async () => ({ json: await infra.configPortable.exportar() }),
    'portable:importar': ({ json }) => infra.configPortable.importar(json),

    'respaldo:exportar': async () => {
      const json = await infra.respaldoPerfil.exportar();
      const ruta = await infra.archivos.seleccionarDestino({
        nombreSugerido: `respaldo-kpitracker-${new Date().toISOString().slice(0, 10)}.json`,
        filtros: [{ nombre: 'Respaldo KPITracker', extensiones: ['json'] }]
      });
      if (!ruta) return { ruta: null };
      await infra.archivos.escribirTexto(ruta, json);
      return { ruta };
    },
    'respaldo:seleccionar': async () => {
      const ruta = await infra.archivos.seleccionarArchivo([{ nombre: 'Respaldo KPITracker', extensiones: ['json'] }]);
      if (!ruta) return null;
      const resumen = infra.respaldoPerfil.leer(await infra.archivos.leerTexto(ruta));
      return { ruta, resumen };
    },
    'respaldo:importar': async ({ ruta, seleccion }) =>
      infra.respaldoPerfil.importar(await infra.archivos.leerTexto(ruta), seleccion),

    'tipos:listar': async () =>
      tipos.listar().map((t) => ({ tipo: String(t.tipo), etiqueta: t.etiqueta, editorHint: t.editorHint })),

    'adjuntos:listar': ({ entidad, entidadId }) => adjuntos.listarPorEntidad(entidad, entidadId),
    'adjuntos:subir': ({ entidad, entidadId, comentario }) => adjuntos.subir(entidad, entidadId, comentario ?? null),
    'adjuntos:abrir': ({ id }) => adjuntos.abrir(id),
    'adjuntos:eliminar': ({ id }) => adjuntos.eliminar(id),

    'sistema:seleccionarArchivo': (payload) => infra.archivos.seleccionarArchivo(payload?.filtros),
    'sistema:leerHojaCalculo': ({ rutaArchivo }) => infra.archivos.leerHojaCalculo(rutaArchivo)
  };

  return { manejadores, servicios: { adjuntos } };
}
