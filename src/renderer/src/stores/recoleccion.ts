import { create } from 'zustand';
import type { Indicador, Periodo } from '@domain/index';
import type { DatosCaptura } from '@application/use-cases/ServicioRecoleccion';
import type { ErrorConflicto } from '../api';
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
  /**
   * Concurrencia (bloqueo optimista): celdas cuyo último intento de guardado
   * fue rechazado porque otra persona cambió el valor mientras tanto (ver
   * `ConflictoConcurrenciaError`, dominio). Distinto de `erroresCeldas` —
   * la UI ofrece "Recargar" en vez de solo mostrar el mensaje, porque
   * reintentar con el mismo valor viejo va a volver a fallar.
   */
  conflictosCeldas: Map<string, ErrorConflicto>;
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
  /**
   * X2 (Batch X): `periodoId` opcional para un deep link desde Seguimiento >
   * Estado que ya sabe a qué período concreto ir (un botón por fila del
   * panel de detalle, en vez del genérico "ir a la captura" que siempre
   * caía en el período pendiente). Si no viene, o no existe entre los
   * períodos del indicador, se conserva el comportamiento de siempre
   * (el último período cerrado).
   */
  seleccionarIndicador(indicadorId: string, periodoId?: string): Promise<void>;
  seleccionarPeriodo(periodoId: string): Promise<void>;
  guardarCelda(claveDesagregacion: string, valorCrudo: string, opciones?: { desdeHistorial?: boolean }): Promise<void>;
  /**
   * Concurrencia: descarta el conflicto de `claveDesagregacion` y recarga la
   * grilla completa (más simple y seguro que parchear una sola celda —
   * cualquier otra puede haber cambiado también) para que la próxima edición
   * parta del valor realmente vigente.
   */
  recargarTrasConflicto(claveDesagregacion: string): Promise<void>;
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
  /** Batch U10: restaura TODAS las desagregaciones del período (no todo el histórico del indicador) al estado vigente en `timestamp`. Retorna cuántas celdas cambiaron. */
  restaurarPeriodo(timestamp: string): Promise<number>;
  /** Solicita el resultado automático del período actual al origen configurado del indicador. */
  obtenerAutomatico(): Promise<void>;
  /** Batch T: capa de aprobación post-registro — no bloquea la captura, solo marca el estado. */
  validarCelda(claveDesagregacion: string, comentario?: string | null): Promise<void>;
  rechazarCelda(claveDesagregacion: string, comentario?: string | null): Promise<void>;
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
  conflictosCeldas: new Map(),
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

  async seleccionarIndicador(indicadorId, periodoId) {
    const [periodos, automatizacion] = await Promise.all([
      invocar('recoleccion:periodos', { indicadorId }),
      invocar('automatizacion:obtener', { indicadorId })
    ]);
    set({
      indicadorId, periodos, periodoId: null, captura: null, pilaDeshacer: [], pilaRehacer: [],
      mensajeAutomatico: null, automatizacionConfigurada: automatizacion != null
    });
    // X2: un `periodoId` explícito (deep link desde el panel de detalle de Seguimiento) gana
    // sobre el default, siempre que exista entre los períodos del indicador — si no, se cae
    // al comportamiento de siempre: el último período cerrado (el más reciente a levantar).
    const pedido = periodoId ? periodos.find((p) => p.id === periodoId) : undefined;
    if (pedido) {
      await get().seleccionarPeriodo(pedido.id);
      return;
    }
    const hoy = new Date().toISOString().slice(0, 10);
    const cerrados = periodos.filter((p) => p.fechaFin < hoy);
    const porDefecto = cerrados[cerrados.length - 1] ?? periodos[periodos.length - 1];
    if (porDefecto) await get().seleccionarPeriodo(porDefecto.id);
  },

  async seleccionarPeriodo(periodoId) {
    const { indicadorId } = get();
    if (!indicadorId) return;
    const captura = await invocar('recoleccion:captura', { indicadorId, periodoId });
    set({
      periodoId, captura, estadoCeldas: new Map(), erroresCeldas: new Map(), conflictosCeldas: new Map(),
      pilaDeshacer: [], pilaRehacer: []
    });
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
      const { valor, advertencias, actualizadoEn } = await invocar('recoleccion:guardarCelda', {
        indicadorId, periodoId, claveDesagregacion, valorCrudo,
        // Bloqueo optimista: se omite en deshacer/rehacer (ver docstring de la acción) — ahí el
        // objetivo es restaurar el valor de todas formas, no volver a chequear concurrencia sobre
        // una edición que la propia persona acaba de hacer un segundo antes.
        versionEsperada: opciones.desdeHistorial ? undefined : (fila?.actualizadoEn ?? null)
      });
      set((s) => ({
        captura: s.captura && {
          ...s.captura,
          advertencias,
          filas: s.captura.filas.map((f) =>
            f.claveDesagregacion === claveDesagregacion
              // Batch T: editar el valor reinicia la validación a Pendiente (mismo criterio que el servidor).
              // `actualizadoEn` viene del servidor (nunca adivinado acá, ver docstring de
              // `ServicioRecoleccion.guardarCelda`) — es la `versionEsperada` de la PRÓXIMA edición.
              ? { ...f, valor, actualizadoEn, estadoValidacion: 'Pendiente', comentarioValidacion: null }
              : f
          )
        },
        conflictosCeldas: s.conflictosCeldas.has(claveDesagregacion)
          ? (() => { const m = new Map(s.conflictosCeldas); m.delete(claveDesagregacion); return m; })()
          : s.conflictosCeldas,
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
      const err = error as Error & { codigo?: string; conflicto?: ErrorConflicto };
      if (err.codigo === 'CONFLICT' && err.conflicto) {
        marcar('error', err.message);
        set((s) => ({ conflictosCeldas: new Map(s.conflictosCeldas).set(claveDesagregacion, err.conflicto!) }));
      } else {
        marcar('error', err.message);
      }
    }
  },

  async recargarTrasConflicto(claveDesagregacion) {
    // `seleccionarPeriodo` recarga la grilla completa y ya limpia `conflictosCeldas` — el
    // parámetro solo documenta la intención en el call-site (qué celda disparó el recargo).
    void claveDesagregacion;
    const { periodoId } = get();
    if (periodoId) await get().seleccionarPeriodo(periodoId);
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
    const { valor, advertencias, actualizadoEn } = await invocar('recoleccion:restaurarVersion', {
      indicadorId, periodoId, claveDesagregacion, version
    });
    set((s) => ({
      captura: s.captura && {
        ...s.captura,
        advertencias,
        // `actualizadoEn` del servidor (nunca adivinado, ver `guardarCelda`) — evita un conflicto
        // falso en la siguiente edición manual de esta misma celda.
        filas: s.captura.filas.map((f) =>
          f.claveDesagregacion === claveDesagregacion ? { ...f, valor, actualizadoEn } : f
        )
      }
    }));
  },

  async restaurarPeriodo(timestamp) {
    const { indicadorId, periodoId } = get();
    if (!indicadorId || !periodoId) return 0;
    const { restauradas } = await invocar('recoleccion:restaurarPeriodo', { indicadorId, periodoId, timestamp });
    // Puede haber cambiado cualquier celda del período: recarga la grilla completa
    // en vez de intentar parchear cada fila a mano (mismo criterio que alternarExclusion).
    await get().seleccionarPeriodo(periodoId);
    return restauradas;
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
  },

  async validarCelda(claveDesagregacion, comentario = null) {
    const { indicadorId, periodoId } = get();
    if (!indicadorId || !periodoId) return;
    await invocar('recoleccion:validar', { indicadorId, periodoId, claveDesagregacion, comentario });
    set((s) => ({
      captura: s.captura && {
        ...s.captura,
        filas: s.captura.filas.map((f) =>
          f.claveDesagregacion === claveDesagregacion ? { ...f, estadoValidacion: 'Validado', comentarioValidacion: comentario } : f
        )
      }
    }));
  },

  async rechazarCelda(claveDesagregacion, comentario = null) {
    const { indicadorId, periodoId } = get();
    if (!indicadorId || !periodoId) return;
    await invocar('recoleccion:rechazar', { indicadorId, periodoId, claveDesagregacion, comentario });
    set((s) => ({
      captura: s.captura && {
        ...s.captura,
        filas: s.captura.filas.map((f) =>
          f.claveDesagregacion === claveDesagregacion ? { ...f, estadoValidacion: 'Rechazado', comentarioValidacion: comentario } : f
        )
      }
    }));
  }
}));
