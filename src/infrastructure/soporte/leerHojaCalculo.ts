import ExcelJS from 'exceljs';

/**
 * Parseo de hoja de cálculo (xlsx/xls/csv) compartido por `ArchivoService`
 * (Electron) y `ArchivoServiceWeb` — antes duplicado idéntico en ambos.
 * `nombreParaExtension` decide csv vs xlsx por extensión; en el escritorio
 * es la propia `rutaArchivo` (ruta real elegida en el diálogo), en el
 * servidor es `archivo.originalname` (el temporal que deja `multer` no
 * conserva extensión).
 */
export async function leerHojaCalculo(
  rutaArchivo: string,
  nombreParaExtension: string = rutaArchivo
): Promise<{ columnas: string[]; filas: Record<string, string>[] }> {
  const libro = new ExcelJS.Workbook();
  if (nombreParaExtension.toLowerCase().endsWith('.csv')) {
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
