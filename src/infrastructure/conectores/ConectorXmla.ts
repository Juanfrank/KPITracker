import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import type { IConectorOrigen, ResultadoPrueba, ResultadoTabular } from '@application/ports/index';
import type { OrigenAutomatico } from '@domain/index';
import { cabeceraBearer } from '../auth/cabeceraAutenticacion';
import type { GuardarOrigen } from '../auth/AutenticadorMicrosoft';

const TIEMPO_MS = 15000;
const NS_XMLA = 'urn:schemas-microsoft-com:xml-analysis';

const SOBRE_DISCOVER = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Discover xmlns="${NS_XMLA}">
      <RequestType>DISCOVER_DATASOURCES</RequestType>
      <Restrictions><RestrictionList/></Restrictions>
      <Properties><PropertyList/></Properties>
    </Discover>
  </soap:Body>
</soap:Envelope>`;

function sobreExecute(catalogo: string | undefined, mdx: string): string {
  const escapado = mdx.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Execute xmlns="${NS_XMLA}">
      <Command><Statement>${escapado}</Statement></Command>
      <Properties>
        <PropertyList>
          ${catalogo ? `<Catalog>${catalogo}</Catalog>` : ''}
          <Format>Multidimensional</Format>
        </PropertyList>
      </Properties>
    </Execute>
  </soap:Body>
</soap:Envelope>`;
}

/** Petición HTTP(S) cruda mínima (sin dependencias), compartida por el SOAP de XMLA y el token OAuth2. */
function peticionHttp(
  urlTexto: string,
  opciones: { metodo: string; cabeceras: Record<string, string>; cuerpo: string }
): Promise<{ status: number; cuerpo: string }> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlTexto);
    } catch {
      reject(new Error(`La URL no es válida: "${urlTexto}".`));
      return;
    }
    const hacer = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = hacer(url, { method: opciones.metodo, headers: opciones.cabeceras, timeout: TIEMPO_MS }, (res) => {
      const trozos: Buffer[] = [];
      res.on('data', (d) => trozos.push(d));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, cuerpo: Buffer.concat(trozos).toString('utf-8') }));
    });
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado.')));
    req.on('error', reject);
    req.write(opciones.cuerpo);
    req.end();
  });
}

/**
 * Cabecera de autenticación a usar en la petición SOAP: Microsoft
 * (inicio de sesión interactivo, delegado) si está configurado, si no
 * OAuth2 Client Credentials (app-únicamente) — ambas compartidas con
 * ConectorPowerBI vía `cabeceraBearer` —, si no Basic (SSAS on-premise
 * clásico; la nube ya no lo admite), si no ninguna.
 */
async function cabeceraAutenticacion(origen: OrigenAutomatico, guardarOrigen?: GuardarOrigen): Promise<Record<string, string>> {
  const cfg = origen.configuracion;
  if (cfg.autenticacion === 'microsoft' || cfg.autenticacion === 'oauth2') return cabeceraBearer(origen, guardarOrigen);
  if (cfg.usuario) {
    return { Authorization: `Basic ${Buffer.from(`${cfg.usuario}:${cfg.contrasena ?? ''}`).toString('base64')}` };
  }
  return {};
}

/**
 * `powerbi://api.powerbi.com/v1.0/myorg/<workspace>` es una convención de
 * nombre de conexión, no una URL HTTP real: las herramientas de Microsoft
 * (SSMS, DAX Studio, Tabular Editor) la resuelven a través del proveedor
 * propietario MSOLAP, que habla un protocolo nativo — NO un simple POST SOAP
 * sobre HTTPS a esa misma ruta (ver el aviso en `motivoEndpointNoSoportado`
 * más abajo, que es lo que realmente bloquea este caso). Esta normalización
 * solo cubre el escenario legítimo restante: un servidor XMLA-sobre-HTTP
 * propio (`msmdpump.dll`) al que, por costumbre o copy-paste, alguien le
 * puso el prefijo `powerbi://` en vez de `https://`.
 */
export function normalizarEndpointXmla(servidor: string): string {
  return /^powerbi:\/\//i.test(servidor) ? servidor.replace(/^powerbi:\/\//i, 'https://') : servidor;
}

/**
 * Un endpoint con forma de URL válida pero que, aunque se traduzca el
 * esquema y se manden los headers SOAP correctos, nunca va a completar una
 * sesión XMLA real: Power BI Premium/Fabric y Azure Analysis Services solo
 * son alcanzables a través del proveedor propietario MSOLAP (documentado
 * por Microsoft — ver el comentario de la clase `ConectorXmla`). Sin esta
 * verificación, la petición viaja igual y vuelve con un HTTP 404 críptico
 * que no explica nada; con ella, se falla de inmediato con un mensaje
 * accionable.
 */
export function motivoEndpointNoSoportado(servidor: string): string | null {
  if (/^powerbi:\/\//i.test(servidor) || /^https?:\/\/api\.powerbi\.com\//i.test(servidor)) {
    return 'Power BI Premium/Fabric no admite XMLA/SOAP crudo: solo es alcanzable con el proveedor propietario MSOLAP (el mismo que usan DAX Studio o Tabular Editor), que esta app no puede replicar. Use un origen de tipo "PowerBI" (API REST "Execute Queries" con DAX) en su lugar.';
  }
  if (/\.asazure\.windows\.net/i.test(servidor)) {
    return 'Azure Analysis Services tampoco admite XMLA/SOAP crudo por HTTP: como Power BI, solo es alcanzable con el proveedor propietario MSOLAP. Esta app no tiene todavía un conector alternativo para Azure Analysis Services.';
  }
  return null;
}

async function enviarSoap(
  origen: OrigenAutomatico,
  sobreXml: string,
  accion: 'Discover' | 'Execute',
  guardarOrigen?: GuardarOrigen
): Promise<string> {
  const servidorCrudo = origen.configuracion.servidor ?? '';
  const motivo = motivoEndpointNoSoportado(servidorCrudo);
  if (motivo) throw new Error(motivo);
  const endpoint = normalizarEndpointXmla(servidorCrudo);
  const auth = await cabeceraAutenticacion(origen, guardarOrigen);
  const cabeceras: Record<string, string> = {
    'Content-Type': 'text/xml; charset=utf-8',
    // Debe identificar la operación real del sobre SOAP (Discover vs Execute):
    // el gateway XMLA de Power BI la usa para enrutar la petición, a
    // diferencia de un listener SSAS on-prem típico que es más laxo y la
    // ignora — un valor incorrecto aquí puede fallar como 404 en Power BI
    // aunque el cuerpo del sobre esté bien formado.
    SOAPAction: `"${NS_XMLA}:${accion}"`,
    'Content-Length': String(Buffer.byteLength(sobreXml)),
    ...auth
  };
  const { status, cuerpo } = await peticionHttp(endpoint, { metodo: 'POST', cabeceras, cuerpo: sobreXml });
  // Un SOAP Fault normalmente viaja con HTTP 500 y un envelope válido en el
  // cuerpo (p. ej. credenciales inválidas): se deja pasar para que el
  // llamador lo detecte vía textoFalla(), en vez de tratarlo como error de
  // transporte genérico y perder el mensaje real del servidor.
  if (status >= 400 && status !== 500) throw new Error(`HTTP ${status}: ${cuerpo.slice(0, 300)}`);
  return cuerpo;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function comoArreglo<T>(valor: T | T[] | undefined): T[] {
  if (valor == null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

function textoFalla(xml: string): string {
  try {
    const doc = parser.parse(xml) as Record<string, unknown>;
    const texto = JSON.stringify(doc);
    const m = /faultstring["'>:\s]+([^"'<]+)/i.exec(texto);
    return m?.[1] ?? 'El servidor devolvió un error SOAP.';
  } catch {
    return 'El servidor devolvió un error SOAP.';
  }
}

/**
 * Conector de mejor esfuerzo para orígenes XMLA contra SSAS on-premise
 * clásico (el gateway `msmdpump.dll`, que sí habla XMLA/SOAP plano sobre
 * HTTP): sin ADOMD.NET disponible fuera de Windows, se implementa como
 * cliente SOAP crudo. Soporta tres formas de autenticación: Basic (usuario/
 * contraseña), OAuth2 vía Client Credentials (tokenUrl/clienteId/
 * clienteSecreto/scope, para automatización desatendida app-únicamente) y
 * Microsoft con inicio de sesión interactivo (tenantId/clienteId/scope,
 * delegado). Aplana únicamente el caso común de un dataset multidimensional
 * de 2 ejes (Columns=medidas, Rows=tuplas); MDX con más ejes o resultados
 * vacíos no se soportan y producen un error explícito.
 *
 * NO usar este tipo para Power BI Premium/Fabric ni Azure Analysis
 * Services: aunque ambos publican una URL con forma de "endpoint XMLA"
 * (`powerbi://...`, `asazure://...`), solo son alcanzables a través del
 * proveedor MSOLAP propietario (documentado por Microsoft: los clientes "no
 * se comunican directamente con el endpoint XMLA", usan las librerías
 * MSOLAP/ADOMD.NET/AMO como capa de abstracción) — un POST SOAP crudo a esa
 * URL nunca completa la sesión y falla, típicamente con HTTP 404, sin
 * importar qué tan correctos sean los headers. Para esos casos existe el
 * tipo `PowerBI` (ver ConectorPowerBI), que usa la API REST pública en vez
 * de XMLA.
 */
export class ConectorXmla implements Pick<IConectorOrigen, 'probar' | 'ejecutar'> {
  constructor(private readonly guardarOrigen?: GuardarOrigen) {}

  async probar(origen: OrigenAutomatico): Promise<ResultadoPrueba> {
    if (!origen.configuracion.servidor) return { ok: false, mensaje: 'Falta la URL del servidor XMLA.' };
    try {
      const respuesta = await enviarSoap(origen, SOBRE_DISCOVER, 'Discover', this.guardarOrigen);
      if (/soap:Fault|<Fault/i.test(respuesta)) return { ok: false, mensaje: textoFalla(respuesta) };
      return { ok: true, mensaje: 'Conexión XMLA exitosa (DISCOVER_DATASOURCES).' };
    } catch (error) {
      return { ok: false, mensaje: `No se pudo conectar: ${(error as Error).message}` };
    }
  }

  async ejecutar(origen: OrigenAutomatico, script: string): Promise<ResultadoTabular> {
    const respuesta = await enviarSoap(origen, sobreExecute(origen.configuracion.catalogo, script), 'Execute', this.guardarOrigen);
    if (/soap:Fault|<Fault/i.test(respuesta)) throw new Error(textoFalla(respuesta));
    return this.aplanar(respuesta);
  }

  private aplanar(xml: string): ResultadoTabular {
    const doc = parser.parse(xml) as Record<string, unknown>;
    const raiz = this.buscarProfundo(doc, 'root') as Record<string, unknown> | undefined;
    const axes = raiz && (this.buscar(raiz, 'Axes') as Record<string, unknown> | undefined);
    if (!axes) throw new Error('La respuesta XMLA no contiene un dataset multidimensional reconocible.');
    const listaEjes = comoArreglo(axes.Axis as unknown);
    const eje0 = listaEjes.find((a) => (a as Record<string, unknown>)['@_name'] === 'Axis0') as Record<string, unknown> | undefined;
    const eje1 = listaEjes.find((a) => (a as Record<string, unknown>)['@_name'] === 'Axis1') as Record<string, unknown> | undefined;
    if (!eje0 || !eje1) {
      throw new Error('Solo se soporta un MDX de 2 ejes (columnas y filas); este resultado tiene una forma distinta.');
    }

    const tuplasColumnas = comoArreglo(this.tuplas(eje0));
    const tuplasFilas = comoArreglo(this.tuplas(eje1));
    if (tuplasFilas.length === 0) throw new Error('El resultado no tiene filas.');

    const nombresColumnasMedida = tuplasColumnas.map((t, i) => this.captionTupla(t) || `Medida${i + 1}`);
    const celdas = comoArreglo((this.buscar(raiz, 'CellData') as Record<string, unknown> | undefined)?.Cell as unknown);
    const valorPorOrdinal = new Map<number, string>();
    for (const celda of celdas) {
      const c = celda as Record<string, unknown>;
      const ordinal = Number(c['@_CellOrdinal']);
      const valor = this.buscar(c, 'Value');
      valorPorOrdinal.set(ordinal, valor == null ? '' : String(valor));
    }

    const columnasDimension = this.nombresHierarquias(tuplasFilas[0] as Record<string, unknown>);
    const columnas = [...columnasDimension, ...nombresColumnasMedida];
    const numColumnas = tuplasColumnas.length || 1;
    const filas = tuplasFilas.map((tupla, fila) => {
      const base: Record<string, string> = {};
      const miembros = comoArreglo((tupla as Record<string, unknown>).Member as unknown);
      columnasDimension.forEach((nombre, idx) => {
        const m = miembros[idx] as Record<string, unknown> | undefined;
        base[nombre] = m ? String(this.buscar(m, 'Caption') ?? '') : '';
      });
      nombresColumnasMedida.forEach((nombre, col) => {
        base[nombre] = valorPorOrdinal.get(fila * numColumnas + col) ?? '';
      });
      return base;
    });

    return { columnas, filas };
  }

  private tuplas(eje: Record<string, unknown>): unknown {
    const tuplas = this.buscar(eje, 'Tuples') as Record<string, unknown> | undefined;
    return tuplas?.Tuple;
  }

  private captionTupla(tupla: unknown): string {
    const miembros = comoArreglo((tupla as Record<string, unknown>).Member as unknown);
    return miembros.map((m) => String(this.buscar(m as Record<string, unknown>, 'Caption') ?? '')).join(' ');
  }

  private nombresHierarquias(tuplaEjemplo: Record<string, unknown> | undefined): string[] {
    const miembros = comoArreglo(tuplaEjemplo?.Member as unknown);
    return miembros.map((m, i) => String((m as Record<string, unknown>)['@_Hierarchy'] ?? `Dimension${i + 1}`).replace(/[[\]]/g, ''));
  }

  /** Busca una clave directa sin importar el prefijo de namespace que haya aplicado el parser (p. ej. "ns:root" vs "root"). */
  private buscar(obj: Record<string, unknown> | undefined, clave: string): unknown {
    if (!obj) return undefined;
    if (clave in obj) return obj[clave];
    const entrada = Object.entries(obj).find(([k]) => k === clave || k.endsWith(`:${clave}`));
    return entrada?.[1];
  }

  /**
   * Busca una clave en cualquier profundidad del árbol (el envoltorio SOAP
   * anida el dataset bajo Envelope/Body/ExecuteResponse/return con
   * prefijos de namespace impredecibles según el servidor).
   */
  private buscarProfundo(obj: unknown, clave: string, visitados = new Set<unknown>()): unknown {
    if (obj == null || typeof obj !== 'object' || visitados.has(obj)) return undefined;
    visitados.add(obj);
    const encontrado = this.buscar(obj as Record<string, unknown>, clave);
    if (encontrado !== undefined) return encontrado;
    for (const valor of Object.values(obj as Record<string, unknown>)) {
      const enHijo = this.buscarProfundo(valor, clave, visitados);
      if (enHijo !== undefined) return enHijo;
    }
    return undefined;
  }
}
