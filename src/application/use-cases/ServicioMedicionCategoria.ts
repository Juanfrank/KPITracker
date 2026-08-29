import {
  ValidacionError, agregar, crearPeriodo, equipoEfectivo, metaVigenteParaPeriodo, puedeVerIndicador, redondear2,
  tipoAgregacionBaseValido
} from '@domain/index';
import type { Categoria, ConfiguracionMedicionCategoria, EntradaAgregable, Indicador, ResultadoMedicionCategoria } from '@domain/index';
import type {
  ICatalogoRepository, IDefinicionPeriodicidadRepository, IIndicadorRepository, IMedicionCategoriaRepository,
  IMetaRepository, IResultadoRepository, IUsuarioRepository
} from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';
import { permisosActuales } from './contextoUsuario';

const CONFIG_POR_DEFECTO = (categoriaId: string): ConfiguracionMedicionCategoria => ({
  categoriaId, reglaGeneral: 'promedio', tratamientoIndicadores: {}, actualizadoEn: ''
});

/**
 * "Medición por categoría/subcategoría" (Batch Y, pedido explícito del
 * usuario): "¿cómo se calcula el resultado del período para el conjunto de
 * indicadores que componen esta categoría?" — una regla general que combina
 * el valor de TODOS los indicadores DIRECTOS de la categoría en un período,
 * con excepciones puntuales por indicador (`TratamientoIndicadorMedicion`,
 * confirmado con el usuario vía `AskUserQuestion`: excluir / peso relativo /
 * agregación propia entre sus desagregaciones en vez del valor GENERAL).
 *
 * Deliberadamente NO agrega recursivamente las subcategorías dentro del
 * padre — cada categoría (incluida una subcategoría) es una configuración
 * independiente, calculada sobre sus propios indicadores directos; no hay
 * "herencia" automática de la regla del padre (ver docstring de la entidad).
 */
export class ServicioMedicionCategoria extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IMedicionCategoriaRepository,
    private readonly categoriasRepo: ICatalogoRepository<Categoria>,
    private readonly indicadoresRepo: IIndicadorRepository,
    private readonly resultadosRepo: IResultadoRepository,
    private readonly metasRepo: IMetaRepository,
    private readonly periodicidadesRepo: IDefinicionPeriodicidadRepository,
    private readonly usuariosRepo: IUsuarioRepository
  ) {
    super(ctx);
  }

  async obtener(categoriaId: string): Promise<ConfiguracionMedicionCategoria> {
    return (await this.repo.obtener(categoriaId)) ?? CONFIG_POR_DEFECTO(categoriaId);
  }

  async guardar(config: ConfiguracionMedicionCategoria): Promise<ConfiguracionMedicionCategoria> {
    const errores: string[] = [];
    if (!(await this.categoriasRepo.obtener(config.categoriaId))) errores.push('La categoría no existe.');
    // Batch Z: solo las 4 reglas base — las 6 nuevas son exclusivas de Cortes de medición.
    if (!tipoAgregacionBaseValido(config.reglaGeneral)) errores.push('La regla general de agregación no es válida.');
    for (const [indicadorId, tratamiento] of Object.entries(config.tratamientoIndicadores)) {
      if (tratamiento.agregacionPropia && !tipoAgregacionBaseValido(tratamiento.agregacionPropia)) {
        errores.push(`La agregación propia del indicador "${indicadorId}" no es válida.`);
      }
      if (tratamiento.peso != null && tratamiento.peso < 0) errores.push(`El peso del indicador "${indicadorId}" no puede ser negativo.`);
    }
    if (errores.length > 0) throw new ValidacionError('Configuración de medición inválida.', errores);

    const guardado: ConfiguracionMedicionCategoria = { ...config, actualizadoEn: this.ctx.reloj.ahoraIso() };
    await this.repo.guardar(guardado);
    await this.auditar('Modificar', 'ConfiguracionMedicionCategoria', config.categoriaId, null, null, config.reglaGeneral);
    return guardado;
  }

  /**
   * Agrega los indicadores DIRECTOS de la categoría para `periodoId` — un id
   * de `Periodo` (p. ej. "2026-Mensual-06"). Solo entran indicadores cuya
   * PROPIA periodicidad coincide con la de `periodoId` (se parsea de su id):
   * si la categoría mezcla periodicidades, hay que calcular una vez por cada
   * una — limitación conocida, documentada, no silenciosa.
   *
   * La operación matemática se efectúa sobre el % de cumplimiento respecto de
   * la meta vigente de cada indicador (valor/meta*100), no sobre el valor
   * crudo — un indicador sin meta resoluble para el período queda fuera.
   */
  async calcular(categoriaId: string, periodoId: string): Promise<ResultadoMedicionCategoria> {
    const config = await this.obtener(categoriaId);
    const [indicadores, usuarios, definicionesLista] = await Promise.all([
      this.indicadoresRepo.listar(), this.usuariosRepo.listar(), this.periodicidadesRepo.listar()
    ]);
    const definiciones = new Map(definicionesLista.map((d) => [d.id, d]));
    const usuariosPorId = new Map(usuarios.map((u) => [u.id, { equipoId: u.equipoId }]));
    const permisos = permisosActuales();

    const [anioStr, periodicidadDelPeriodo, numeroStr] = periodoId.split('-');
    const anio = Number(anioStr);
    const numero = Number(numeroStr);

    const deLaCategoria = indicadores.filter(
      (i: Indicador) =>
        i.categoria === categoriaId && !i.esCalculado && `${i.periodicidad}` === periodicidadDelPeriodo &&
        puedeVerIndicador(permisos, { equipoEfectivoId: equipoEfectivo(i, usuariosPorId), responsable: i.responsable })
    );

    const entradas: EntradaAgregable[] = [];
    for (const indicador of deLaCategoria) {
      const tratamiento = config.tratamientoIndicadores[indicador.id];
      if (tratamiento?.excluir) continue;

      const resultadosIndicador = await this.resultadosRepo.obtenerPorIndicadorPeriodo(indicador.id, periodoId);
      const general = resultadosIndicador.find((r) => r.claveDesagregacion === 'GENERAL')?.valor ?? null;

      let valor: number | null;
      if (tratamiento?.agregacionPropia) {
        const propias = resultadosIndicador
          .filter((r) => r.claveDesagregacion !== 'GENERAL' && r.valor != null)
          .map((r) => ({ valor: r.valor as number, tieneMeta: false }));
        valor = propias.length > 0 ? agregar(tratamiento.agregacionPropia, propias) : general;
      } else {
        valor = general;
      }
      if (valor == null) continue;

      // Aclaración explícita del usuario: la operación matemática del subtotal
      // se efectúa sobre el % de cumplimiento respecto de la meta, no sobre el
      // valor crudo — sin meta resoluble para este período no hay % posible,
      // el indicador queda fuera de la agregación de la categoría.
      let meta: number | null = null;
      try {
        const definicion = indicador.periodicidadPersonalizadaId ? definiciones.get(indicador.periodicidadPersonalizadaId) : undefined;
        const periodo = crearPeriodo(anio, indicador.periodicidad, numero, definicion);
        const metasIndicador = await this.metasRepo.listarPorIndicador(indicador.id);
        const metaVigente = metaVigenteParaPeriodo(metasIndicador, 'GENERAL', periodo, definiciones);
        meta = metaVigente?.valor ?? indicador.metaGlobal;
      } catch {
        // Periodicidad Personalizada sin definición resoluble: sin meta ubicable, se excluye abajo.
      }
      if (meta == null || meta === 0) continue;

      entradas.push({ valor: redondear2((valor / meta) * 100), tieneMeta: true, peso: tratamiento?.peso });
    }

    return {
      categoriaId,
      regla: config.reglaGeneral,
      valorAgregado: agregar(config.reglaGeneral, entradas),
      indicadoresConsiderados: entradas.length
    };
  }
}
