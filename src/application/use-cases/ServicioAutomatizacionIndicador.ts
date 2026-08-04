import {
  EntidadNoEncontradaError, GeneradorPeriodos, Periodicidad, ValidacionError, conciliarConLista,
  resolverParametrosGenerales, sustituirTokens
} from '@domain/index';
import type {
  AutomatizacionIndicador, DefinicionPeriodicidad, ElementoLista, OrigenAutomatico, ParametroDinamico, Periodo
} from '@domain/index';
import type { ReporteConciliacion } from '@domain/services/ConciliacionLista';
import type {
  ICatalogoRepository, IAtributoRepository, IAutomatizacionIndicadorRepository, IConectorOrigen,
  IDefinicionPeriodicidadRepository, IIndicadorRepository, IListaRepository, ResultadoTabular
} from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';

/**
 * Configuración y prueba de la obtención automática de resultados de un
 * indicador: script (con parámetros dinámicos de sus atributos y generales
 * del período), ejecución de prueba contra el origen, y conciliación de los
 * valores devueltos contra los elementos oficiales de cada desagregación
 * mapeada. La escritura real de celdas al presionar "Obtener
 * automáticamente" en Recolección vive en ServicioRecoleccion, que reutiliza
 * esta misma configuración persistida.
 */
export class ServicioAutomatizacionIndicador extends ServicioBase {
  private readonly generadorPeriodos = new GeneradorPeriodos();

  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IAutomatizacionIndicadorRepository,
    private readonly indicadores: IIndicadorRepository,
    private readonly origenesRepo: ICatalogoRepository<OrigenAutomatico>,
    private readonly atributosRepo: IAtributoRepository,
    private readonly listasRepo: IListaRepository,
    private readonly periodicidadesRepo: IDefinicionPeriodicidadRepository,
    private readonly conector: IConectorOrigen
  ) {
    super(ctx);
  }

  obtener(indicadorId: string): Promise<AutomatizacionIndicador | null> {
    return this.repo.obtenerPorIndicador(indicadorId);
  }

  async guardar(config: AutomatizacionIndicador): Promise<AutomatizacionIndicador> {
    if (!config.indicadorId) throw new ValidacionError('Falta el indicador.');
    if (!config.origenAutomaticoId) throw new ValidacionError('Debe seleccionar un origen automático.');
    const anterior = await this.repo.obtenerPorIndicador(config.indicadorId);
    const ahora = this.ctx.reloj.ahoraIso();
    const guardado: AutomatizacionIndicador = anterior
      ? { ...config, id: anterior.id, creadoEn: anterior.creadoEn, actualizadoEn: ahora }
      : { ...config, id: config.id || this.ctx.ids.nuevoId(), creadoEn: ahora, actualizadoEn: ahora };
    await this.repo.guardar(guardado);
    await this.auditar(anterior ? 'Modificar' : 'Crear', 'AutomatizacionIndicador', guardado.indicadorId);
    return guardado;
  }

  async eliminar(indicadorId: string): Promise<void> {
    await this.repo.eliminar(indicadorId);
    await this.auditar('Eliminar', 'AutomatizacionIndicador', indicadorId);
  }

  private async definicionPara(indicadorId: string): Promise<DefinicionPeriodicidad | undefined> {
    const indicador = await this.indicadores.obtener(indicadorId);
    if (!indicador) throw new EntidadNoEncontradaError('Indicador', indicadorId);
    if (indicador.periodicidad !== Periodicidad.Personalizada || !indicador.periodicidadPersonalizadaId) return undefined;
    return (await this.periodicidadesRepo.obtener(indicador.periodicidadPersonalizadaId)) ?? undefined;
  }

  private construirPeriodo(periodoId: string, definicion?: DefinicionPeriodicidad): Periodo {
    const [anioTexto, periodicidad] = periodoId.split('-');
    const periodo = this.generadorPeriodos
      .periodosDelAnio(Number(anioTexto), periodicidad as Periodicidad, definicion)
      .find((p) => p.id === periodoId);
    if (!periodo) throw new EntidadNoEncontradaError('Periodo', periodoId);
    return periodo;
  }

  /**
   * Ejecuta un script (aún no necesariamente guardado, para permitir probar
   * mientras se edita) contra un origen, resolviendo los parámetros
   * dinámicos y generales para el indicador y período dados. Sirve tanto de
   * prueba de conexión con datos reales como de fuente para el paso de
   * mapeo de columnas.
   */
  async ejecutarPrueba(
    indicadorId: string,
    periodoId: string,
    origenAutomaticoId: string,
    parametrosDinamicos: ParametroDinamico[],
    script: string
  ): Promise<ResultadoTabular> {
    const origen = await this.origenesRepo.obtener(origenAutomaticoId);
    if (!origen) throw new ValidacionError('El origen seleccionado no existe.');
    const definicion = await this.definicionPara(indicadorId);
    const periodo = this.construirPeriodo(periodoId, definicion);
    const tokens = resolverParametrosGenerales(origen.parametrosGenerales, periodo);
    const valoresAtributos = await this.atributosRepo.obtenerValores('Indicador', indicadorId);
    for (const parametro of parametrosDinamicos) {
      const valor = valoresAtributos.find((v) => v.atributoId === parametro.atributoId);
      tokens.set(
        parametro.nombre,
        valor ? (valor.valorTexto ?? valor.valorNumero?.toString() ?? valor.valorFecha ?? (valor.valorBooleano != null ? String(valor.valorBooleano) : '')) : ''
      );
    }
    try {
      return await this.conector.ejecutar(origen, sustituirTokens(script, tokens));
    } catch (error) {
      throw new ValidacionError(`No se pudo ejecutar el script: ${(error as Error).message}`);
    }
  }

  /** Compara los valores únicos de una columna del resultado contra los elementos oficiales de la lista. */
  async validarColumna(listaId: string, valoresUnicos: string[]): Promise<ReporteConciliacion> {
    const elementos = await this.listasRepo.listarElementos(listaId);
    return conciliarConLista(valoresUnicos, elementos);
  }

  /** Agrega a la lista, como elementos nuevos, los códigos que el resultado trajo y la lista aún no tenía. */
  async agregarElementosFaltantes(listaId: string, codigos: string[]): Promise<ElementoLista[]> {
    const lista = await this.listasRepo.obtener(listaId);
    if (!lista) throw new EntidadNoEncontradaError('Lista', listaId);
    const existentes = await this.listasRepo.listarElementos(listaId);
    let orden = existentes.length > 0 ? Math.max(...existentes.map((e) => e.orden)) : 0;
    const creados: ElementoLista[] = [];
    for (const codigo of codigos) {
      if (existentes.some((e) => e.codigo === codigo)) continue;
      orden += 1;
      const nuevo: ElementoLista = {
        id: this.ctx.ids.nuevoId(), listaId, codigo, nombre: codigo, descripcion: '', orden, padreCodigo: null, activo: true
      };
      await this.listasRepo.guardarElemento(nuevo);
      creados.push(nuevo);
    }
    if (creados.length > 0) {
      await this.auditar('Crear', 'ElementoLista', listaId, null, null,
        `Agregados desde conciliación de origen automático: ${creados.map((c) => c.codigo).join(', ')}`);
    }
    return creados;
  }
}
