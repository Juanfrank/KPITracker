import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { NoImplementadoError } from '@domain/index';
import type { IArchivoService } from '@application/ports/index';
import type { RutasDataLake } from '../parquet/RutasDataLake';
import { leerHojaCalculo as leerHojaCalculoCompartido } from './leerHojaCalculo';

/**
 * Implementación web de `IArchivoService`: idéntica a `ArchivoService` para
 * todo lo que no depende de Electron (copiar adjuntos, leer hojas de
 * cálculo, leer/escribir texto), pero SIN `dialog`/`shell` — no tienen
 * equivalente en un proceso de servidor. Los tres métodos que sí eran
 * puramente diálogos nativos (`abrir`, `seleccionarArchivo`,
 * `seleccionarDestino`) están reemplazados por rutas REST reales (ver
 * `src/server/rest/`): el navegador sube el archivo directamente
 * (`POST /api/adjuntos`, `POST /api/importacion/hoja-calculo`) o descarga la
 * respuesta (`GET /api/adjuntos/:id/descarga`, `GET /api/respaldo/exportar`)
 * — nada en el código del servidor debería llamarlos, así que lanzan en vez
 * de fallar en silencio si alguna vez se invocan por error.
 */
export class ArchivoServiceWeb implements IArchivoService {
  constructor(private readonly rutas: RutasDataLake) {}

  async guardarAdjunto(rutaOrigen: string, nombreSugerido: string): Promise<{ rutaRelativa: string; tamanioBytes: number }> {
    const nombreSeguro = basename(nombreSugerido).replace(/[/\\]/g, '_');
    const nombreArchivo = `${randomUUID()}_${nombreSeguro}`;
    await mkdir(this.rutas.adjuntos, { recursive: true });
    const destino = join(this.rutas.adjuntos, nombreArchivo);
    await copyFile(rutaOrigen, destino);
    const info = await stat(destino);
    return { rutaRelativa: join('Adjuntos', nombreArchivo), tamanioBytes: info.size };
  }

  rutaAbsoluta(rutaRelativa: string): string {
    return resolve(this.rutas.raiz, rutaRelativa);
  }

  async eliminarArchivo(rutaRelativa: string): Promise<void> {
    await unlink(this.rutaAbsoluta(rutaRelativa)).catch(() => undefined);
  }

  async abrir(): Promise<void> {
    throw new NoImplementadoError('abrir() no aplica en el servidor — use GET /api/adjuntos/:id/descarga.');
  }

  async seleccionarArchivo(): Promise<string | null> {
    throw new NoImplementadoError('seleccionarArchivo() no aplica en el servidor — el archivo llega por subida HTTP.');
  }

  async leerHojaCalculo(rutaArchivo: string, nombreOriginal?: string): Promise<{ columnas: string[]; filas: Record<string, string>[] }> {
    return leerHojaCalculoCompartido(rutaArchivo, nombreOriginal);
  }

  async seleccionarDestino(): Promise<string | null> {
    throw new NoImplementadoError('seleccionarDestino() no aplica en el servidor — la respuesta HTTP ES la descarga.');
  }

  async escribirTexto(ruta: string, contenido: string): Promise<void> {
    await writeFile(ruta, contenido, 'utf-8');
  }

  async leerTexto(ruta: string): Promise<string> {
    return readFile(ruta, 'utf-8');
  }
}
