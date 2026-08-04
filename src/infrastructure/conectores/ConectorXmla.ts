import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import type { IConectorOrigen, ResultadoPrueba, ResultadoTabular } from '@application/ports/index';
import type { OrigenAutomatico } from '@domain/index';

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

function enviarSoap(origen: OrigenAutomatico, sobreXml: string): Promise<string> {
  const endpoint = origen.configuracion.servidor ?? '';
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      reject(new Error('El servidor XMLA debe ser una URL válida (http/https).'));
      return;
    }
    const hacer = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const cabeceras: Record<string, string> = {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `"${NS_XMLA}:Execute"`,
      'Content-Length': String(Buffer.byteLength(sobreXml))
    };
    if (origen.configuracion.usuario) {
      cabeceras.Authorization = `Basic ${Buffer.from(`${origen.configuracion.usuario}:${origen.configuracion.contrasena ?? ''}`).toString('base64')}`;
    }
    const req = hacer(url, { method: 'POST', headers: cabeceras, timeout: TIEMPO_MS }, (res) => {
      const trozos: Buffer[] = [];
      res.on('data', (d) => trozos.push(d));
      res.on('end', () => {
        const cuerpo = Buffer.concat(trozos).toString('utf-8');
        if ((res.statusCode ?? 0) >= 400) reject(new Error(`HTTP ${res.statusCode}: ${cuerpo.slice(0, 300)}`));
        else resolve(cuerpo);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado.')));
    req.on('error', reject);
    req.write(sobreXml);
    req.end();
  });
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
 * Conector de mejor esfuerzo para orígenes XMLA (SSAS): sin ADOMD.NET
 * disponible fuera de Windows, se implementa como cliente SOAP crudo con
 * autenticación básica. Aplana únicamente el caso común de un dataset
 * multidimensional de 2 ejes (Columns=medidas, Rows=tuplas); MDX con más
 * ejes o resultados vacíos no se soportan y producen un error explícito.
 */
export class ConectorXmla implements Pick<IConectorOrigen, 'probar' | 'ejecutar'> {
  async probar(origen: OrigenAutomatico): Promise<ResultadoPrueba> {
    if (!origen.configuracion.servidor) return { ok: false, mensaje: 'Falta la URL del servidor XMLA.' };
    try {
      const respuesta = await enviarSoap(origen, SOBRE_DISCOVER);
      if (/soap:Fault|<Fault/i.test(respuesta)) return { ok: false, mensaje: textoFalla(respuesta) };
      return { ok: true, mensaje: 'Conexión XMLA exitosa (DISCOVER_DATASOURCES).' };
    } catch (error) {
      return { ok: false, mensaje: `No se pudo conectar: ${(error as Error).message}` };
    }
  }

  async ejecutar(origen: OrigenAutomatico, script: string): Promise<ResultadoTabular> {
    const respuesta = await enviarSoap(origen, sobreExecute(origen.configuracion.catalogo, script));
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
