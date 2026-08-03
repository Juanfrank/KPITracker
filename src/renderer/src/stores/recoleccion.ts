import { create } from 'zustand';
import type { Indicador, Periodo } from '@domain/index';
import type { DatosCaptura } from '@application/use-cases/ServicioRecoleccion';
import { invocar } from '../api';

export type EstadoCelda = 'guardando' | 'guardada' | 'error';

interface CambioCelda {
  claveDesagregacion: string;
  valorAnterior: string;
  valorNuevo: string;
}

interface EstadoRecoleccion {
  indicadores: Indicador[];
  indicadorId: string | null;
  periodos: Periodo[];
  periodoId: string | null;
  captura: DatosCaptura | null;
  /** Estado visual de autoguardado por celda. */
  estadoCeldas: Map<string, EstadoCelda>;
  erroresCeldas: Map<string, string>;
  pilaDeshacer: CambioCelda[];
  pilaRehacer: CambioCelda[];

  cargarIndicadores(): Promise<void>;
  seleccionarIndicador(indicadorId: string): Promise<void>;
  seleccionarPeriodo(periodoId: string): Promise<void>;
  guardarCelda(claveDesagregacion: string, valorCrudo: string, opciones?: { desdeHistorial?: boolean }): Promise<void>;
  deshacer(): Promise<void>;
  rehacer(): Promise<void>;
  establecerFechaCorte(fechaCorte: string | null): Promise<void>;
  alternarExclusion(listaId: string, excluir: boolean): Promise<void>;
  /** Pegado desde Excel: aplica valores TSV a partir de una fila. */
  pegarDesde(filaInicio: number, textoPortapapeles: string): Promise<void>;
}

/**
 * ViewModel de Recolección (MVVM): coordina selección de indicador/período,
 * autoguardado por celda con indicadores visuales, deshacer/rehacer y
 * pegado masivo desde el portapapeles.
 */
export const useRecoleccion = create<EstadoRecoleccion>((set, get) => ({
  indicadores: [],
  indicadorId: null,
  periodos: [],
  periodoId: null,
  captura: null,
  estadoCeldas: new Map(),
  erroresCeldas: new Map(),
  pilaDeshacer: [],
  pilaRehacer: [],

  async cargarIndicadores() {
    const indicadores = (await invocar('indicadores:listar', undefined)).filter((i) => i.estado === 'Activo');
    set({ indicadores });
  },

  async seleccionarIndicador(indicadorId) {
    const periodos = await invocar('recoleccion:periodos', { indicadorId });
    set({ indicadorId, periodos, periodoId: null, captura: null, pilaDeshacer: [], pilaRehacer: [] });
    // Selecciona por defecto el último período cerrado (el más reciente a levantar).
    const hoy = new Date().toISOString().slice(0, 10);
    const cerrados = periodos.filter((p) => p.fechaFin < hoy);
    const porDefecto = cerrados[cerrados.length - 1] ?? periodos[periodos.length - 1];
    if (porDefecto) await get().seleccionarPeriodo(porDefecto.id);
  },

  async seleccionarPeriodo(periodoId) {
    const { indicadorId } = get();
    if (!indicadorId) return;
    const captura = await invocar('recoleccion:captura', { indicadorId, periodoId });
    set({ periodoId, captura, estadoCeldas: new Map(), erroresCeldas: new Map(), pilaDeshacer: [], pilaRehacer: [] });
  },

  async guardarCelda(claveDesagregacion, valorCrudo, opciones = {}) {
    const { indicadorId, periodoId, captura } = get();
    if (!indicadorId || !periodoId || !captura) return;

    const fila = captura.filas.find((f) => f.claveDesagregacion === claveDesagregacion);
    const valorAnterior = fila?.valor == null ? '' : String(fila.valor);
    if (valorAnterior === valorCrudo.trim()) return;

    const marcar = (estado: EstadoCelda, error?: string): void => {
      set((s) => {
        const estadoCeldas = new Map(s.estadoCeldas).set(claveDesagregacion, estado);
        const erroresCeldas = new Map(s.erroresCeldas);
        if (error) erroresCeldas.set(claveDesagregacion, error);
        else erroresCeldas.delete(claveDesagregacion);
        return { estadoCeldas, erroresCeldas };
      });
    };

    marcar('guardando');
    try {
      const { valor } = await invocar('recoleccion:guardarCelda', {
        indicadorId, periodoId, claveDesagregacion, valorCrudo
      });
      set((s) => ({
        captura: s.captura && {
          ...s.captura,
          filas: s.captura.filas.map((f) =>
            f.claveDesagregacion === claveDesagregacion ? { ...f, valor, actualizadoEn: new Date().toISOString() } : f
          )
        },
        pilaDeshacer: opciones.desdeHistorial
          ? s.pilaDeshacer
          : [...s.pilaDeshacer, { claveDesagregacion, valorAnterior, valorNuevo: valorCrudo }],
        pilaRehacer: opciones.desdeHistorial ? s.pilaRehacer : []
      }));
      marcar('guardada');
      setTimeout(() => {
        set((s) => {
          const estadoCeldas = new Map(s.estadoCeldas);
          if (estadoCeldas.get(claveDesagregacion) === 'guardada') estadoCeldas.delete(claveDesagregacion);
          return { estadoCeldas };
        });
      }, 1200);
    } catch (error) {
      marcar('error', (error as Error).message);
    }
  },

  async deshacer() {
    const { pilaDeshacer } = get();
    const cambio = pilaDeshacer[pilaDeshacer.length - 1];
    if (!cambio) return;
    set({ pilaDeshacer: pilaDeshacer.slice(0, -1) });
    await get().guardarCelda(cambio.claveDesagregacion, cambio.valorAnterior, { desdeHistorial: true });
    set((s) => ({ pilaRehacer: [...s.pilaRehacer, cambio] }));
  },

  async rehacer() {
    const { pilaRehacer } = get();
    const cambio = pilaRehacer[pilaRehacer.length - 1];
    if (!cambio) return;
    set({ pilaRehacer: pilaRehacer.slice(0, -1) });
    await get().guardarCelda(cambio.claveDesagregacion, cambio.valorNuevo, { desdeHistorial: true });
    set((s) => ({ pilaDeshacer: [...s.pilaDeshacer, cambio] }));
  },

  async establecerFechaCorte(fechaCorte) {
    const { indicadorId, periodoId } = get();
    if (!indicadorId || !periodoId) return;
    await invocar('recoleccion:fechaCorte', { indicadorId, periodoId, fechaCorte });
    set((s) => ({ captura: s.captura && { ...s.captura, fechaCorte } }));
  },

  async alternarExclusion(listaId, excluir) {
    const { indicadorId, periodoId } = get();
    if (!indicadorId || !periodoId) return;
    await invocar('recoleccion:exclusion', { indicadorId, periodoId, listaId, excluir });
    // La exclusión cambia las combinaciones: recarga la grilla.
    await get().seleccionarPeriodo(periodoId);
  },

  async pegarDesde(filaInicio, textoPortapapeles) {
    const { captura } = get();
    if (!captura) return;
    // Formato Excel: filas separadas por \n, columnas por \t (se usa la primera columna).
    const valores = textoPortapapeles
      .replace(/\r/g, '')
      .split('\n')
      .filter((linea) => linea.trim() !== '')
      .map((linea) => linea.split('\t')[0] ?? '');
    for (let i = 0; i < valores.length; i++) {
      const fila = captura.filas[filaInicio + i];
      if (!fila) break;
      await get().guardarCelda(fila.claveDesagregacion, valores[i] ?? '');
    }
  }
}));
