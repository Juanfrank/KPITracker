import {
  EntidadNoEncontradaError, GeneradorPeriodos, ProductoCartesiano, TipoDato,
  ValidacionError, claveATexto
} from '@domain/index';
import type { ElementoLista, Levantamiento, Periodo, TypeRegistry } from '@domain/index';
import type {
  IConfiguracionRepository, IIndicadorRepository, IListaRepository, IResultadoRepository
} from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';

export interface FilaCaptura {
  claveDesagregacion: string;
  etiquetas: Array<{ listaId: string; listaNombre: string; codigo: string; descripcion: string }>;
  esGeneral: boolean;
  valor: number | null;
  observacion: string | null;
  actualizadoEn: string | null;
}

export interface DatosCaptura {
  indicadorId: string;
  periodoId: string;
  periodoEtiqueta: string;
  fechaCorte: string | null;
  desagregacionesDisponibles: Array<{ listaId: string; nombre: string; excluida: boolean }>;
  filas: FilaCaptura[];
}

/**
 * Caso de uso central de la Recolección: arma la grilla de captura
 * (producto cartesiano + fila General + exclusiones temporales), y persiste
 * cada celda de forma automática (sin botón Guardar) con validación y
 * auditoría de valor anterior/nuevo.
 */
export class ServicioRecoleccion extends ServicioBase {
  private readonly generadorPeriodos = new GeneradorPeriodos();
  private readonly productoCartesiano = new ProductoCartesiano();

  constructor(
    ctx: ContextoAplicacion,
    private readonly indicadores: IIndicadorRepository,
    private readonly listas: IListaRepository,
    private readonly resultados: IResultadoRepository,
    private readonly configuracion: IConfiguracionRepository,
    private readonly tipos: TypeRegistry
  ) {
    super(ctx);
  }

  /** Períodos disponibles según periodicidad del indicador y año inicial global. */
  async periodosDisponibles(indicadorId: string): Promise<Periodo[]> {
    const indicador = await this.indicadores.obtener(indicadorId);
    if (!indicador) throw new EntidadNoEncontradaError('Indicador', indicadorId);
    const config = await this.configuracion.obtener();
    return this.generadorPeriodos.periodosDisponibles(config.anioInicial, indicador.periodicidad, this.ctx.reloj.hoyIso());
  }

  async obtenerCaptura(indicadorId: string, periodoId: string): Promise<DatosCaptura> {
    const indicador = await this.indicadores.obtener(indicadorId);
    if (!indicador) throw new EntidadNoEncontradaError('Indicador', indicadorId);

    const levantamiento = await this.resultados.obtenerLevantamiento(indicadorId, periodoId);
    const excluidas = levantamiento?.desagregacionesExcluidas ?? [];

    const elementosPorLista = new Map<string, ElementoLista[]>();
    const nombresListas = new Map<string, string>();
    for (const listaId of indicador.desagregaciones) {
      const lista = await this.listas.obtener(listaId);
      nombresListas.set(listaId, lista?.nombre ?? listaId);
      elementosPorLista.set(listaId, await this.listas.listarElementos(listaId));
    }

    const combinaciones = this.productoCartesiano.generar(indicador.desagregaciones, elementosPorLista, excluidas);
    const existentes = await this.resultados.obtenerPorIndicadorPeriodo(indicadorId, periodoId);
    const porClave = new Map(existentes.map((r) => [r.claveDesagregacion, r]));

    const filas: FilaCaptura[] = combinaciones.map((c) => {
      const clave = claveATexto(c.clave);
      const existente = porClave.get(clave);
      return {
        claveDesagregacion: clave,
        etiquetas: c.etiquetas.map((e) => ({ ...e, listaNombre: nombresListas.get(e.listaId) ?? e.listaId })),
        esGeneral: clave === 'GENERAL',
        valor: existente?.valor ?? null,
        observacion: existente?.observacion ?? null,
        actualizadoEn: existente?.actualizadoEn ?? null
      };
    });

    const etiquetaPeriodo = this.etiquetaPeriodo(periodoId);
    return {
      indicadorId,
      periodoId,
      periodoEtiqueta: etiquetaPeriodo,
      fechaCorte: levantamiento?.fechaCorte ?? null,
      desagregacionesDisponibles: indicador.desagregaciones.map((listaId) => ({
        listaId,
        nombre: nombresListas.get(listaId) ?? listaId,
        excluida: excluidas.includes(listaId)
      })),
      filas
    };
  }

  /**
   * Persiste una celda (autoguardado). `valorCrudo` llega como texto de la
   * grilla o del portapapeles (pegado desde Excel) y se parsea con el tipo
   * Decimal del TypeRegistry.
   */
  async guardarCelda(
    indicadorId: string,
    periodoId: string,
    claveDesagregacion: string,
    valorCrudo: string,
    observacion: string | null = null
  ): Promise<{ valor: number | null }> {
    const parseado = this.tipos.obtener(TipoDato.Decimal).parse(valorCrudo);
    if (!parseado.ok) throw new ValidacionError(parseado.error ?? 'Valor inválido.');
    const valor = parseado.valor as number | null;

    const existentes = await this.resultados.obtenerPorIndicadorPeriodo(indicadorId, periodoId);
    const anterior = existentes.find((r) => r.claveDesagregacion === claveDesagregacion) ?? null;
    const ahora = this.ctx.reloj.ahoraIso();
    await this.resultados.guardar({
      id: anterior?.id ?? this.ctx.ids.nuevoId(),
      indicadorId,
      periodoId,
      anio: Number(periodoId.slice(0, 4)),
      claveDesagregacion,
      valor,
      observacion: observacion ?? anterior?.observacion ?? null,
      creadoEn: anterior?.creadoEn ?? ahora,
      actualizadoEn: ahora
    });
    await this.auditar('Modificar', 'Resultado', `${indicadorId}:${periodoId}:${claveDesagregacion}`,
      'valor', anterior?.valor ?? null, valor);
    this.sincronizarExport();
    return { valor };
  }

  /** La fecha de corte es única por indicador+período y obligatoria para completar. */
  async establecerFechaCorte(indicadorId: string, periodoId: string, fechaCorte: string | null): Promise<void> {
    const anterior = await this.resultados.obtenerLevantamiento(indicadorId, periodoId);
    await this.guardarLevantamiento(indicadorId, periodoId, {
      fechaCorte,
      desagregacionesExcluidas: anterior?.desagregacionesExcluidas ?? []
    }, anterior);
    await this.auditar('Modificar', 'Levantamiento', `${indicadorId}:${periodoId}`, 'fechaCorte',
      anterior?.fechaCorte ?? null, fechaCorte);
    this.sincronizarExport();
  }

  /** Exclusión temporal de una desagregación: nunca modifica el indicador. */
  async alternarExclusion(indicadorId: string, periodoId: string, listaId: string, excluir: boolean): Promise<void> {
    const anterior = await this.resultados.obtenerLevantamiento(indicadorId, periodoId);
    const actuales = new Set(anterior?.desagregacionesExcluidas ?? []);
    if (excluir) actuales.add(listaId);
    else actuales.delete(listaId);
    await this.guardarLevantamiento(indicadorId, periodoId, {
      fechaCorte: anterior?.fechaCorte ?? null,
      desagregacionesExcluidas: [...actuales]
    }, anterior);
    await this.auditar('Modificar', 'Levantamiento', `${indicadorId}:${periodoId}`, 'exclusiones',
      JSON.stringify(anterior?.desagregacionesExcluidas ?? []), JSON.stringify([...actuales]));
  }

  private async guardarLevantamiento(
    indicadorId: string,
    periodoId: string,
    datos: Pick<Levantamiento, 'fechaCorte' | 'desagregacionesExcluidas'>,
    anterior: Levantamiento | null
  ): Promise<void> {
    const ahora = this.ctx.reloj.ahoraIso();
    await this.resultados.guardarLevantamiento({
      id: anterior?.id ?? this.ctx.ids.nuevoId(),
      indicadorId,
      periodoId,
      anio: Number(periodoId.slice(0, 4)),
      fechaCorte: datos.fechaCorte,
      desagregacionesExcluidas: datos.desagregacionesExcluidas,
      creadoEn: anterior?.creadoEn ?? ahora,
      actualizadoEn: ahora
    });
  }

  private etiquetaPeriodo(periodoId: string): string {
    const [anio, periodicidad, numero] = periodoId.split('-');
    try {
      return (
        this.generadorPeriodos.periodosDelAnio(Number(anio), periodicidad as never)[Number(numero) - 1]?.etiqueta ??
        periodoId
      );
    } catch {
      return periodoId;
    }
  }
}
