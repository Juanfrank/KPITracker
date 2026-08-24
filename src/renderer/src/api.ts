import type { CanalesIpc, NombreCanal } from '@shared/ipc';
import { TRPCClientError } from '@trpc/client';
import { trpcClient } from './trpc';

type TipoProcedimiento = 'query' | 'mutation';

/**
 * Traduce cada canal a su procedimiento tRPC equivalente (`[router,
 * procedimiento, tipo]`) — tabla mecánica derivada 1:1 de los 20 routers en
 * `src/server/trpc/routers/*.ts` (Fase 3): la clasificación query/mutation
 * ya se decidió al escribirlos (lecturas puras → query; todo lo que muta
 * datos o dispara I/O externa → mutation).
 *
 * Los canales que en Fase 3 se movieron a rutas REST planas (archivos:
 * `adjuntos:subir`/`adjuntos:abrir`, `sistema:seleccionarArchivo`/
 * `sistema:leerHojaCalculo`, `respaldo:*`, `portable:*`) NO están aquí a
 * propósito — sus call-sites hablan directo con `/api/*` vía
 * `src/renderer/src/rest.ts`, no a través de `invocar()`. Tampoco están los
 * canales `perfiles:*` (retirados, ver plan §9.5).
 */
const TABLA_PROCEDIMIENTOS: Partial<Record<NombreCanal, [string, string, TipoProcedimiento]>> = {
  'config:obtener': ['config', 'obtener', 'query'],
  'config:guardar': ['config', 'guardar', 'mutation'],
  'config:reglasFechaLimite': ['config', 'reglasFechaLimite', 'query'],

  'indicadores:listar': ['indicadores', 'listar', 'query'],
  'indicadores:obtener': ['indicadores', 'obtener', 'query'],
  'indicadores:guardar': ['indicadores', 'guardar', 'mutation'],
  'indicadores:eliminar': ['indicadores', 'eliminar', 'mutation'],
  'indicadores:reasignarMasivo': ['indicadores', 'reasignarMasivo', 'mutation'],
  'indicadores:importarExcel': ['indicadores', 'importarExcel', 'mutation'],

  'atributos:listar': ['atributos', 'listar', 'query'],
  'atributos:guardar': ['atributos', 'guardar', 'mutation'],
  'atributos:eliminar': ['atributos', 'eliminar', 'mutation'],
  'atributos:restaurar': ['atributos', 'restaurar', 'mutation'],
  'atributos:valores': ['atributos', 'valores', 'query'],
  'atributos:guardarValor': ['atributos', 'guardarValor', 'mutation'],

  'listas:listar': ['listas', 'listar', 'query'],
  'listas:guardar': ['listas', 'guardar', 'mutation'],
  'listas:eliminar': ['listas', 'eliminar', 'mutation'],
  'listas:restaurar': ['listas', 'restaurar', 'mutation'],
  'listas:elementos': ['listas', 'elementos', 'query'],
  'listas:guardarElemento': ['listas', 'guardarElemento', 'mutation'],
  'listas:eliminarElemento': ['listas', 'eliminarElemento', 'mutation'],
  'listas:aliasOrigen': ['listas', 'aliasOrigen', 'query'],
  'listas:aliasPorOrigen': ['listas', 'aliasPorOrigen', 'query'],
  'listas:guardarAliasOrigen': ['listas', 'guardarAliasOrigen', 'mutation'],
  'listas:eliminarAliasOrigen': ['listas', 'eliminarAliasOrigen', 'mutation'],

  'metas:listar': ['metas', 'listar', 'query'],
  'metas:guardar': ['metas', 'guardar', 'mutation'],
  'metas:eliminar': ['metas', 'eliminar', 'mutation'],

  'reglas:listar': ['reglas', 'listar', 'query'],
  'reglas:guardar': ['reglas', 'guardar', 'mutation'],
  'reglas:eliminar': ['reglas', 'eliminar', 'mutation'],
  'reglas:restaurar': ['reglas', 'restaurar', 'mutation'],

  'periodicidades:listar': ['periodicidades', 'listar', 'query'],
  'periodicidades:guardar': ['periodicidades', 'guardar', 'mutation'],
  'periodicidades:eliminar': ['periodicidades', 'eliminar', 'mutation'],

  'categorias:listar': ['categorias', 'listar', 'query'],
  'categorias:guardar': ['categorias', 'guardar', 'mutation'],
  'categorias:eliminar': ['categorias', 'eliminar', 'mutation'],
  'categorias:restaurar': ['categorias', 'restaurar', 'mutation'],

  'equipos:listar': ['equipos', 'listar', 'query'],
  'equipos:guardar': ['equipos', 'guardar', 'mutation'],
  'equipos:eliminar': ['equipos', 'eliminar', 'mutation'],
  'equipos:restaurar': ['equipos', 'restaurar', 'mutation'],

  'origenes:listar': ['origenes', 'listar', 'query'],
  'origenes:guardar': ['origenes', 'guardar', 'mutation'],
  'origenes:eliminar': ['origenes', 'eliminar', 'mutation'],
  'origenes:restaurar': ['origenes', 'restaurar', 'mutation'],
  'origenes:probar': ['origenes', 'probar', 'mutation'],
  'origenes:probarCodigo': ['origenes', 'probarCodigo', 'mutation'],

  'automatizacion:obtener': ['automatizacion', 'obtener', 'query'],
  'automatizacion:guardar': ['automatizacion', 'guardar', 'mutation'],
  'automatizacion:eliminar': ['automatizacion', 'eliminar', 'mutation'],
  'automatizacion:ejecutarPrueba': ['automatizacion', 'ejecutarPrueba', 'mutation'],
  'automatizacion:validarColumna': ['automatizacion', 'validarColumna', 'query'],
  'automatizacion:agregarElementosFaltantes': ['automatizacion', 'agregarElementosFaltantes', 'mutation'],

  'recoleccion:periodos': ['recoleccion', 'periodos', 'query'],
  'recoleccion:captura': ['recoleccion', 'captura', 'query'],
  'recoleccion:guardarCelda': ['recoleccion', 'guardarCelda', 'mutation'],
  'recoleccion:fechaCorte': ['recoleccion', 'fechaCorte', 'mutation'],
  'recoleccion:comentario': ['recoleccion', 'comentario', 'mutation'],
  'recoleccion:exclusion': ['recoleccion', 'exclusion', 'mutation'],
  'recoleccion:historial': ['recoleccion', 'historial', 'query'],
  'recoleccion:restaurarVersion': ['recoleccion', 'restaurarVersion', 'mutation'],
  'recoleccion:obtenerAutomatico': ['recoleccion', 'obtenerAutomatico', 'mutation'],
  'recoleccion:validar': ['recoleccion', 'validar', 'mutation'],
  'recoleccion:rechazar': ['recoleccion', 'rechazar', 'mutation'],

  'seguimiento:tablero': ['seguimiento', 'tablero', 'query'],
  'seguimiento:detalle': ['seguimiento', 'detalle', 'query'],
  'seguimiento:historico': ['seguimiento', 'historico', 'query'],

  'exportacion:regenerar': ['exportacion', 'regenerar', 'mutation'],
  'exportacion:ruta': ['exportacion', 'ruta', 'query'],

  'auditoria:consultar': ['auditoria', 'consultar', 'query'],

  'tipos:listar': ['tipos', 'listar', 'query'],

  'adjuntos:listar': ['adjuntos', 'listar', 'query'],
  'adjuntos:eliminar': ['adjuntos', 'eliminar', 'mutation'],

  'sistema:info': ['sistema', 'info', 'query']
};

interface ProcedimientoInvocable {
  query: (input: unknown) => Promise<unknown>;
  mutate: (input: unknown) => Promise<unknown>;
}

/** Indexa `trpcClient` dinámicamente por nombre de router/procedimiento — la única línea que necesita un cast en todo el shim. */
function resolverProcedimiento(router: string, procedimiento: string): ProcedimientoInvocable {
  const clienteIndexable = trpcClient as unknown as Record<string, Record<string, ProcedimientoInvocable>>;
  return clienteIndexable[router]![procedimiento]!;
}

/**
 * Punto único de acceso al backend desde los ViewModels — la firma NO
 * cambió respecto a la era IPC (ver historial de este archivo): por dentro
 * ahora traduce `'modulo:accion'` a la llamada tRPC equivalente en vez de
 * `window.api.invocar`, así que ninguno de los ~117 call-sites existentes
 * necesitó tocarse. Reconstruye el mismo `Error` con `.detalles` que ya
 * esperaban esos call-sites (antes venía de `RespuestaIpc.detalles`, ahora
 * de `TRPCClientError.data.detalles` — mismo `errorFormatter`, ver
 * `src/server/trpc/trpc.ts`).
 */
export async function invocar<C extends NombreCanal>(
  canal: C,
  payload: CanalesIpc[C]['req']
): Promise<CanalesIpc[C]['res']> {
  const entrada = TABLA_PROCEDIMIENTOS[canal];
  if (!entrada) {
    throw new Error(
      `El canal "${canal}" no tiene un procedimiento tRPC equivalente — pasó a ser una ruta REST (ver src/renderer/src/rest.ts).`
    );
  }
  const [router, procedimiento, tipo] = entrada;
  const invocable = resolverProcedimiento(router, procedimiento);
  try {
    const resultado = tipo === 'query' ? await invocable.query(payload) : await invocable.mutate(payload);
    return resultado as CanalesIpc[C]['res'];
  } catch (error) {
    if (error instanceof TRPCClientError) {
      const reconstruido = new Error(error.message) as Error & { detalles?: string[] };
      reconstruido.detalles = (error.data as { detalles?: string[] } | undefined)?.detalles;
      throw reconstruido;
    }
    throw error;
  }
}
