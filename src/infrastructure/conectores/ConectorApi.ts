import type { IConectorOrigen, ResultadoPrueba, ResultadoTabular } from '@application/ports/index';
import type { OrigenAutomatico } from '@domain/index';

const TIEMPO_PRUEBA_MS = 8000;
const TIEMPO_EJECUCION_MS = 20000;

function cabeceras(origen: OrigenAutomatico): Record<string, string> {
  const cabeceras: Record<string, string> = {};
  if (origen.configuracion.token) cabeceras.Authorization = `Bearer ${origen.configuracion.token}`;
  return cabeceras;
}

/** Encuentra el primer arreglo dentro de una respuesta JSON: el cuerpo mismo, o la primera propiedad que sea arreglo. */
function extraerArreglo(datos: unknown): Record<string, unknown>[] {
  if (Array.isArray(datos)) return datos as Record<string, unknown>[];
  if (datos && typeof datos === 'object') {
    const arreglo = Object.values(datos as Record<string, unknown>).find((v) => Array.isArray(v));
    if (Array.isArray(arreglo)) return arreglo as Record<string, unknown>[];
  }
  throw new Error('La respuesta no contiene un arreglo de resultados tabulares.');
}

function aTabular(datos: unknown): ResultadoTabular {
  const registros = extraerArreglo(datos);
  const columnas = [...new Set(registros.flatMap((r) => Object.keys(r ?? {})))];
  const filas = registros.map((r) => Object.fromEntries(columnas.map((c) => [c, r[c] == null ? '' : String(r[c])])));
  return { columnas, filas };
}

/** Conector real para orígenes tipo API (HTTP/JSON), vía fetch nativo de Node. */
export class ConectorApi implements Pick<IConectorOrigen, 'probar' | 'ejecutar'> {
  async probar(origen: OrigenAutomatico): Promise<ResultadoPrueba> {
    const url = origen.configuracion.url;
    if (!url) return { ok: false, mensaje: 'Falta la URL del endpoint.' };
    try {
      const respuesta = await fetch(url, {
        method: 'GET',
        headers: cabeceras(origen),
        signal: AbortSignal.timeout(TIEMPO_PRUEBA_MS)
      });
      if (!respuesta.ok) {
        return { ok: false, mensaje: `El servidor respondió ${respuesta.status} ${respuesta.statusText}.` };
      }
      return { ok: true, mensaje: `Conexión exitosa (HTTP ${respuesta.status}).` };
    } catch (error) {
      return { ok: false, mensaje: `No se pudo conectar: ${(error as Error).message}` };
    }
  }

  async ejecutar(origen: OrigenAutomatico, script: string): Promise<ResultadoTabular> {
    const base = (origen.configuracion.url ?? '').replace(/\/$/, '');
    const metodo = (origen.configuracion.metodo || 'GET').toUpperCase();
    const esGet = metodo === 'GET';
    const script_ = script.trim();
    const url = script_.startsWith('http') ? script_ : `${base}${script_.startsWith('/') || script_.startsWith('?') ? '' : '/'}${script_}`;

    const respuesta = await fetch(esGet ? url : base, {
      method: metodo,
      headers: { ...cabeceras(origen), ...(esGet ? {} : { 'Content-Type': 'application/json' }) },
      body: esGet ? undefined : script_,
      signal: AbortSignal.timeout(TIEMPO_EJECUCION_MS)
    });
    if (!respuesta.ok) throw new Error(`El servidor respondió ${respuesta.status} ${respuesta.statusText}.`);
    const datos: unknown = await respuesta.json();
    return aTabular(datos);
  }
}
