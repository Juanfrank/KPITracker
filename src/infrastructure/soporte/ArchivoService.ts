import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { dialog, shell } from 'electron';
import ExcelJS from 'exceljs';
import type { IArchivoService } from '@application/ports/index';
import type { RutasDataLake } from '../parquet/RutasDataLake';

/**
 * Implementación de IArchivoService para el proceso main: copia adjuntos a
 * /Data/Adjuntos, abre el diálogo nativo de selección de archivo y lee hojas
 * de cálculo (xlsx/csv) para la importación de indicadores.
 */
export class ArchivoService implements IArchivoService {
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

  async abrir(rutaRelativa: string): Promise<void> {
    await shell.openPath(this.rutaAbsoluta(rutaRelativa));
  }

  async seleccionarArchivo(filtros?: { nombre: string; extensiones: string[] }[]): Promise<string | null> {
    const resultado = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: filtros?.map((f) => ({ name: f.nombre, extensions: f.extensiones }))
    });
    if (resultado.canceled || resultado.filePaths.length === 0) return null;
    return resultado.filePaths[0] ?? null;
  }

  async leerHojaCalculo(rutaArchivo: string): Promise<{ columnas: string[]; filas: Record<string, string>[] }> {
    const libro = new ExcelJS.Workbook();
    if (rutaArchivo.toLowerCase().endsWith('.csv')) {
      await libro.csv.readFile(rutaArchivo);
    } else {
      await libro.xlsx.readFile(rutaArchivo);
    }
    const hoja = libro.worksheets[0];
    if (!hoja) return { columnas: [], filas: [] };

    const filaEncabezado = hoja.getRow(1);
    const columnas: string[] = [];
    filaEncabezado.eachCell({ includeEmpty: false }, (celda) => {
      columnas.push(String(celda.value ?? '').trim());
    });

    const filas: Record<string, string>[] = [];
    hoja.eachRow((fila, numeroFila) => {
      if (numeroFila === 1) return;
      const registro: Record<string, string> = {};
      let tieneAlgunValor = false;
      columnas.forEach((columna, indice) => {
        const celda = fila.getCell(indice + 1);
        const valor = celda.value == null ? '' : String(celda.text ?? celda.value).trim();
        if (valor) tieneAlgunValor = true;
        registro[columna] = valor;
      });
      if (tieneAlgunValor) filas.push(registro);
    });

    return { columnas, filas };
  }

  async seleccionarDestino(opciones: {
    nombreSugerido: string;
    filtros?: { nombre: string; extensiones: string[] }[];
  }): Promise<string | null> {
    const resultado = await dialog.showSaveDialog({
      defaultPath: opciones.nombreSugerido,
      filters: opciones.filtros?.map((f) => ({ name: f.nombre, extensions: f.extensiones }))
    });
    if (resultado.canceled || !resultado.filePath) return null;
    return resultado.filePath;
  }

  async escribirTexto(ruta: string, contenido: string): Promise<void> {
    await writeFile(ruta, contenido, 'utf-8');
  }

  async leerTexto(ruta: string): Promise<string> {
    return readFile(ruta, 'utf-8');
  }
}
