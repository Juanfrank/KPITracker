/** Un corte (período) dentro de una definición de periodicidad personalizada. */
export interface CortePeriodicidad {
  /** Ordinal 1..n dentro del año, consecutivo. */
  numero: number;
  /** Etiqueta legible: "Cuatrimestre especial 1". */
  etiqueta: string;
  /** Mes de inicio (1-12). */
  mesInicio: number;
  /** Mes de fin (1-12), >= mesInicio. */
  mesFin: number;
}

/**
 * Definición de periodicidad personalizada: una partición del año en
 * cortes definidos por el usuario (meses de inicio/fin), sin huecos ni
 * solapes y con cobertura completa de enero a diciembre. Un indicador con
 * `periodicidad = Personalizada` referencia una de estas definiciones por
 * `periodicidadPersonalizadaId`.
 */
export interface DefinicionPeriodicidad {
  readonly id: string;
  nombre: string;
  descripcion: string;
  cortes: CortePeriodicidad[];
  readonly creadoEn: string;
  actualizadoEn: string;
}

/**
 * Valida que los cortes sean consecutivos (1..n), con meses en rango,
 * sin huecos ni solapes, cubriendo el año completo (enero a diciembre).
 * Retorna la lista de errores encontrados (vacía si la definición es válida).
 */
export function validarDefinicionPeriodicidad(cortes: CortePeriodicidad[]): string[] {
  const errores: string[] = [];
  if (cortes.length === 0) {
    return ['La definición debe tener al menos un corte.'];
  }

  const ordenados = [...cortes].sort((a, b) => a.numero - b.numero);
  ordenados.forEach((c, i) => {
    if (c.numero !== i + 1) {
      errores.push(`Los números de corte deben ser consecutivos desde 1 (se esperaba ${i + 1}, se encontró ${c.numero}).`);
    }
    if (c.mesInicio < 1 || c.mesInicio > 12 || c.mesFin < 1 || c.mesFin > 12) {
      errores.push(`El corte ${c.numero} tiene meses fuera de rango (1-12).`);
    } else if (c.mesFin < c.mesInicio) {
      errores.push(`El corte ${c.numero}: el mes final no puede ser anterior al mes inicial.`);
    }
  });
  // Si hay errores estructurales, no seguir validando cobertura (evita mensajes en cascada).
  if (errores.length > 0) return errores;

  if (ordenados[0]!.mesInicio !== 1) errores.push('El primer corte debe iniciar en enero (mes 1).');
  if (ordenados[ordenados.length - 1]!.mesFin !== 12) errores.push('El último corte debe finalizar en diciembre (mes 12).');
  for (let i = 1; i < ordenados.length; i++) {
    const anterior = ordenados[i - 1]!;
    const actual = ordenados[i]!;
    if (actual.mesInicio !== anterior.mesFin + 1) {
      errores.push(`Hay un hueco o solape entre el corte ${anterior.numero} y el corte ${actual.numero}.`);
    }
  }
  return errores;
}
