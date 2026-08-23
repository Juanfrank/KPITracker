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
  /** Mensaje de la última obtención automática intentada (éxito o error), para mostrar en la UI. */
  mensajeAutomatico: string | null;
  /** Si el indicador seleccionado tiene configurada la obtención automática (muestra el botón en la UI). */
  automatizacionConfigurada: boolean;

  cargarIndicadores(): Promise<void>;
  /**
   * Recarga indicadores, períodos/automatización y la captura del período ya
   * seleccionado, SIN perder esa selección (a diferencia de
   * `seleccionarIndicador`, que la resetea al período más reciente). El
   * store es un singleton de módulo: sobrevive a navegar a otra página y
   * volver, así que sin este refresco explícito, la captura visible tras
   * volver a Recolección seguía siendo la de antes de irse — con
   * desagregaciones/nombres de elementos desactualizados si mientras tanto
   * se creó una lista o se agregaron elementos (p. ej. desde la
   * conciliación de un origen automático en Indicadores).
   */
  refrescar(): Promise<void>;
  seleccionarIndicador(indicadorId: string): Promise<void>;
  seleccionarPeriodo(periodoId: string): Promise<void>;
  guardarCelda(claveDesagregacion: string, valorCrudo: string, opciones?: { desdeHistorial?: boolean }): Promise<void>;
  deshacer(): Promise<void>;
  rehacer(): Promise<void>;
  establecerFechaCorte(fechaCorte: string | null): Promise<void>;
  establecerComentario(comentario: string | null): Promise<void>;
  alternarExclusion(listaId: string, excluir: boolean): Promise<void>;
  /**
   * Pegado desde Excel: aplica valores TSV a partir de la celda donde se
   * pegó. Recibe las claves de las filas destino YA en el orden visible en
   * pantalla (que con la grilla como árbol puede tener filas colapsadas
   * de por medio) — así el pegado nunca cae en una fila oculta.
   */
  pegarDesde(clavesEnOrden: string[], textoPortapapeles: string): Promise<void>;
  /** Restaura una versión anterior de una celda (registra el estado actual en el historial). */
  restaurarVersion(claveDesagregacion: string, version: number): Promise<void>;
  /** Solicita el resultado automático del período actual al origen configurado del indicador. */
  obtenerAutomatico(): Promise<void>;
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
  mensajeAutomatico: null,
  automatizacionConfigurada: false,

  async cargarIndicadores() {
    const indicadores = (await invocar('indicadores:listar', undefined)).filter((i) => i.estado === 'Activo');
    set({ indicadores });
  },

  async refrescar() {
    await get().cargarIndicadores();
    const { indicadorId, periodoId } = get();
    if (!indicadorId) return;
    const [periodos, automatizacion] = await Promise.all([
      invocar('recoleccion:periodos', { indicadorId }),
      invocar('automatizacion:obtener', { indicadorId })
    ]);
    set({ periodos, automatizacionConfigurada: automatizacion != null });
    if (periodoId) {
      const captura = await invocar('recoleccion:captura', { indicadorId, periodoId });
      set({ captura });
    }
  },

  async seleccionarIndicador(indicadorId) {
    const [periodos, automatizacion] = await Promise.all([
      invocar('recoleccion:periodos', { indicadorId }),
      invocar('automatizacion:obtener', { indicadorId })
    ]);
    set({
      indicadorId, periodos, periodoId: null, captura: null, pilaDeshacer: [], pilaRehacer: [],
      mensajeAutomatico: null, automatizacionConfigurada: automatizacion != null
    });
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
      const { valor, advertencias } = await invocar('recoleccion:guardarCelda', {
        indicadorId, periodoId, claveDesagregacion, valorCrudo
      });
      set((s) => ({
        captura: s.captura && {
          ...s.captura,
          advertencias,
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

  async establecerComentario(comentario) {
    const { indicadorId, periodoId } = get();
    if (!indicadorId || !periodoId) return;
    await invocar('recoleccion:comentario', { indicadorId, periodoId, comentario });
    set((s) => ({ captura: s.captura && { ...s.captura, comentario } }));
  },

  async alternarExclusion(listaId, excluir) {
    const { indicadorId, periodoId } = get();
    if (!indicadorId || !periodoId) return;
    await invocar('recoleccion:exclusion', { indicadorId, periodoId, listaId, excluir });
    // La exclusión cambia las combinaciones: recarga la grilla.
    await get().seleccionarPeriodo(periodoId);
  },

  async restaurarVersion(claveDesagregacion, version) {
    const { indicadorId, periodoId } = get();
    if (!indicadorId || !periodoId) return;
    const { valor, advertencias } = await invocar('recoleccion:restaurarVersion', {
      indicadorId, periodoId, claveDesagregacion, version
    });
    set((s) => ({
      captura: s.captura && {
        ...s.captura,
        advertencias,
        filas: s.captura.filas.map((f) =>
          f.claveDesagregacion === claveDesagregacion ? { ...f, valor, actualizadoEn: new Date().toISOString() } : f
        )
      }
    }));
  },

  async obtenerAutomatico() {
    const { indicadorId, periodoId } = get();
    if (!indicadorId || !periodoId) return;
    set({ mensajeAutomatico: null });
    try {
      const { celdasActualizadas, filasConError, desagregacionesSinMapear } = await invocar('recoleccion:obtenerAutomatico', {
        indicadorId, periodoId
      });
      const partes = [`${celdasActualizadas} celda(s) actualizada(s).`];
      if (filasConError > 0) partes.push(`${filasConError} fila(s) del resultado no se pudieron aplicar.`);
      if (desagregacionesSinMapear.length > 0) partes.push('Hay desagregaciones sin mapear: complételas manualmente.');
      set({ mensajeAutomatico: partes.join(' ') });
      await get().seleccionarPeriodo(periodoId);
    } catch (error) {
      set({ mensajeAutomatico: (error as Error).message });
    }
  },

  async pegarDesde(clavesEnOrden, textoPortapapeles) {
    // Formato Excel: filas separadas por \n, columnas por \t (se usa la primera columna).
    const valores = textoPortapapeles
      .replace(/\r/g, '')
      .split('\n')
      .filter((linea) => linea.trim() !== '')
      .map((linea) => linea.split('\t')[0] ?? '');
    for (let i = 0; i < valores.length && i < clavesEnOrden.length; i++) {
      await get().guardarCelda(clavesEnOrden[i]!, valores[i] ?? '');
    }
  }
}));
