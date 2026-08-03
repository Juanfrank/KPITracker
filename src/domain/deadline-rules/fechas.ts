/** Utilidades puras de fechas (UTC) para las reglas de fecha límite. */

export interface FechaYmd {
  anio: number;
  mes: number; // 1..12
  dia: number; // 1..31
}

export function parseYmd(iso: string): FechaYmd {
  const [a, m, d] = iso.split('-').map(Number);
  return { anio: a ?? 0, mes: m ?? 1, dia: d ?? 1 };
}

export function formatYmd(f: FechaYmd): string {
  return `${String(f.anio).padStart(4, '0')}-${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}`;
}

export function diasEnMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** 0=domingo .. 6=sábado. */
export function diaSemana(f: FechaYmd): number {
  return new Date(Date.UTC(f.anio, f.mes - 1, f.dia)).getUTCDay();
}

export function esDiaHabil(f: FechaYmd): boolean {
  const ds = diaSemana(f);
  return ds >= 1 && ds <= 5;
}

export function sumarDias(f: FechaYmd, dias: number): FechaYmd {
  const fecha = new Date(Date.UTC(f.anio, f.mes - 1, f.dia + dias));
  return { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1, dia: fecha.getUTCDate() };
}

/** Mes siguiente al mes dado. */
export function mesSiguiente(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
}

/** N-ésima ocurrencia (1..5) de un día de semana en un mes; null si no existe. */
export function nEsimoDiaSemanaDelMes(anio: number, mes: number, diaSem: number, n: number): FechaYmd | null {
  let contador = 0;
  const total = diasEnMes(anio, mes);
  for (let d = 1; d <= total; d++) {
    const f = { anio, mes, dia: d };
    if (diaSemana(f) === diaSem) {
      contador++;
      if (contador === n) return f;
    }
  }
  return null;
}

export function ultimoDiaSemanaDelMes(anio: number, mes: number, diaSem: number): FechaYmd {
  const total = diasEnMes(anio, mes);
  for (let d = total; d >= 1; d--) {
    const f = { anio, mes, dia: d };
    if (diaSemana(f) === diaSem) return f;
  }
  throw new Error('Mes sin el día de semana solicitado (imposible).');
}

export function primerDiaHabilDelMes(anio: number, mes: number): FechaYmd {
  for (let d = 1; d <= diasEnMes(anio, mes); d++) {
    const f = { anio, mes, dia: d };
    if (esDiaHabil(f)) return f;
  }
  throw new Error('Mes sin días hábiles (imposible).');
}

export function ultimoDiaHabilDelMes(anio: number, mes: number): FechaYmd {
  for (let d = diasEnMes(anio, mes); d >= 1; d--) {
    const f = { anio, mes, dia: d };
    if (esDiaHabil(f)) return f;
  }
  throw new Error('Mes sin días hábiles (imposible).');
}
