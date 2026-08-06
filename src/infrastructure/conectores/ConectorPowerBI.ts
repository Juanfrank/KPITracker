import type { IConectorOrigen, ResultadoPrueba, ResultadoTabular } from '@application/ports/index';
import type { OrigenAutomatico } from '@domain/index';
import { cabeceraBearer } from '../auth/cabeceraAutenticacion';
import type { GuardarOrigen } from '../auth/AutenticadorMicrosoft';

const TIEMPO_MS = 30000;
const BASE_REST_POR_DEFECTO = 'https://api.powerbi.com/v1.0/myorg';

/**
 * Arma la URL de "Execute Queries" (API REST pública de Power BI, no
 * XMLA): `datasetId` (GUID del semantic model) es obligatorio; `groupId`
 * (GUID del workspace) es opcional — sin él, apunta a "Mi área de trabajo".
 * `apiBase` es opcional y por defecto es la nube comercial de Power BI;
 * existe para las nubes soberanas (`api.powerbigov.us`, `api.powerbi.de`,
 * `api.powerbi.cn`), que exponen la misma API REST en un host distinto.
 */
function urlExecuteQueries(cfg: Record<string, string>): { url: string } | { error: string } {
  const datasetId = (cfg.datasetId ?? '').trim();
  if (!datasetId) return { error: 'Falta el Id del dataset (datasetId) — cópielo desde Configuración del semantic model en el servicio de Power BI.' };
  const groupId = (cfg.groupId ?? '').trim();
  const base = (cfg.apiBase || BASE_REST_POR_DEFECTO).replace(/\/$/, '');
  return { url: groupId ? `${base}/groups/${groupId}/datasets/${datasetId}/executeQueries` : `${base}/datasets/${datasetId}/executeQueries` };
}

interface ErrorPowerBI {
  code?: string;
  message?: string;
  'pbi.error'?: { code?: string; details?: { code?: string; detail?: { type?: string; value?: string } }[] };
}

interface RespuestaExecuteQueries {
  results?: { tables?: { rows?: Record<string, unknown>[] }[] }[];
  error?: ErrorPowerBI;
}

function mensajeError(error: ErrorPowerBI | undefined, status: number, textoCrudo: string): string {
  const detalle = error?.['pbi.error']?.details?.[0]?.detail?.value;
  return `HTTP ${status}: ${detalle || error?.message || error?.code || textoCrudo.slice(0, 300)}`;
}

/** Ejecuta una consulta DAX vía la API REST "Execute Queries" y devuelve las filas de la primera tabla del primer resultado. */
async function ejecutarDax(origen: OrigenAutomatico, dax: string, guardarOrigen?: GuardarOrigen): Promise<Record<string, unknown>[]> {
  const resuelto = urlExecuteQueries(origen.configuracion);
  if ('error' in resuelto) throw new Error(resuelto.error);
  const auth = await cabeceraBearer(origen, guardarOrigen);
  if (!auth.Authorization) {
    throw new Error('Configure autenticación (Microsoft o OAuth2) para el origen Power BI: la API REST no admite Basic ni conexiones sin credenciales.');
  }
  const respuesta = await fetch(resuelto.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ queries: [{ query: dax }], serializerSettings: { includeNulls: true } }),
    signal: AbortSignal.timeout(TIEMPO_MS)
  });
  const texto = await respuesta.text();
  let datos: RespuestaExecuteQueries;
  try {
    datos = texto ? (JSON.parse(texto) as RespuestaExecuteQueries) : {};
  } catch {
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}: ${texto.slice(0, 300)}`);
    throw new Error('La respuesta de Power BI no es JSON válido.');
  }
  if (!respuesta.ok) throw new Error(mensajeError(datos.error, respuesta.status, texto));
  return datos.results?.[0]?.tables?.[0]?.rows ?? [];
}

function aTabular(filas: Record<string, unknown>[]): ResultadoTabular {
  const columnas = [...new Set(filas.flatMap((f) => Object.keys(f ?? {})))];
  return { columnas, filas: filas.map((f) => Object.fromEntries(columnas.map((c) => [c, f[c] == null ? '' : String(f[c])]))) };
}

/**
 * Conector real para orígenes tipo Power BI: la API REST pública de Power
 * BI, "Execute Queries" (`POST .../datasets/{id}/executeQueries`), que
 * ejecuta una consulta DAX contra un semantic model y devuelve JSON. A
 * diferencia de un origen XMLA (ver ConectorXmla), este endpoint es
 * HTTPS+JSON estándar y está públicamente documentado, así que un cliente
 * HTTP de mejor esfuerzo sí puede hablarlo — no requiere el proveedor
 * propietario MSOLAP. Reutiliza la autenticación Azure AD compartida con
 * XMLA (Microsoft interactivo u OAuth2 Client Credentials con un service
 * principal habilitado para las API de Power BI); no admite Basic, porque
 * la API REST de Power BI nunca lo acepta.
 */
export class ConectorPowerBI implements Pick<IConectorOrigen, 'probar' | 'ejecutar'> {
  constructor(private readonly guardarOrigen?: GuardarOrigen) {}

  async probar(origen: OrigenAutomatico): Promise<ResultadoPrueba> {
    try {
      await ejecutarDax(origen, 'EVALUATE {1}', this.guardarOrigen);
      return { ok: true, mensaje: 'Conexión exitosa (consulta DAX de prueba ejecutada contra el dataset).' };
    } catch (error) {
      return { ok: false, mensaje: `No se pudo conectar: ${(error as Error).message}` };
    }
  }

  async ejecutar(origen: OrigenAutomatico, script: string): Promise<ResultadoTabular> {
    const filas = await ejecutarDax(origen, script, this.guardarOrigen);
    return aTabular(filas);
  }
}
