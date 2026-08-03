import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Db } from '../duckdb/Db';
import { PARQUET_POR_TABLA } from '../duckdb/esquema';
import type { RutasDataLake } from './RutasDataLake';

function sq(ruta: string): string {
  return ruta.replace(/'/g, "''");
}

/**
 * Materializa las tablas del almacén de trabajo a archivos Parquet en /Data.
 * Minimiza reescrituras: cada tabla se marca "sucia" al escribir y solo las
 * sucias se vuelcan; FactResultados se particiona por año y solo se
 * reescriben las particiones (años) modificadas.
 */
export class ParquetSyncService {
  private readonly tablasSucias = new Set<string>();
  private readonly aniosResultadosSucios = new Set<number>();
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private sincronizando: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: Db,
    private readonly rutas: RutasDataLake,
    private readonly debounceMs = 500
  ) {}

  marcarSucia(tabla: string): void {
    this.tablasSucias.add(tabla);
    this.programar();
  }

  marcarResultadosSucios(anio: number): void {
    this.aniosResultadosSucios.add(anio);
    this.programar();
  }

  private programar(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      void this.sincronizar();
    }, this.debounceMs);
  }

  /** Vuelca ahora todo lo pendiente (se usa también al cerrar la app). */
  async sincronizar(): Promise<void> {
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    const tablas = [...this.tablasSucias];
    const anios = [...this.aniosResultadosSucios];
    this.tablasSucias.clear();
    this.aniosResultadosSucios.clear();

    // Serializa las sincronizaciones para evitar escrituras solapadas.
    this.sincronizando = this.sincronizando.then(async () => {
      for (const tabla of tablas) {
        const rel = PARQUET_POR_TABLA[tabla];
        if (!rel) continue;
        const destino = join(this.rutas.raiz, rel);
        mkdirSync(dirname(destino), { recursive: true });
        await this.db.run(`COPY (SELECT * FROM ${tabla}) TO '${sq(destino)}' (FORMAT PARQUET)`);
      }
      for (const anio of anios) {
        const dir = join(this.rutas.factResultadosDir, `anio=${anio}`);
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        const destino = join(dir, 'datos.parquet');
        await this.db.run(
          `COPY (SELECT id, indicador_id, periodo_id, clave_desagregacion, valor, observacion, creado_en, actualizado_en
                 FROM resultados WHERE anio = ${anio})
           TO '${sq(destino)}' (FORMAT PARQUET)`
        );
      }
    });
    await this.sincronizando;
  }

  get pendiente(): boolean {
    return this.tablasSucias.size > 0 || this.aniosResultadosSucios.size > 0;
  }
}
