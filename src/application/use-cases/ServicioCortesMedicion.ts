import {
  EntidadNoEncontradaError, GeneradorPeriodos, Periodicidad, ValidacionError, agregar, equipoEfectivo,
  metaVigenteParaPeriodo, periodicidadCorteValida, puedeVerIndicador, tipoAgregacionValido
} from '@domain/index';
import type { CorteMedicion, DefinicionPeriodicidad, EntradaAgregable, ResultadoCorteMedicion } from '@domain/index';
import type {
  IConfiguracionRepository, ICorteMedicionRepository, IDefinicionPeriodicidadRepository, IIndicadorRepository,
  IMetaRepository, IResultadoRepository, IUsuarioRepository
} from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';
import { permisosActuales } from './contextoUsuario';

/**
 * "Cortes de medición" (Batch Y, pedido explícito del usuario): un corte es
 * una PERIODICIDAD recurrente superior al mes (Bimestral..Anual, rediseño
 * de Batch AA — antes era una fecha puntual). Cada período de esa
 * periodicidad ("T1 2026", "T2 2026"...) es un "bucket": agrega, indicador
 * por indicador, todos sus períodos más finos cuya ventana cae dentro de la
 * suya, con una regla de agregación (general o específica por indicador).
 * No modifica ningún resultado — es puramente de LECTURA/reportería,
 * calculado bajo demanda (`calcular`).
 *
 * Aclaración explícita del usuario: la agregación opera sobre el % de
 * cumplimiento respecto de la meta vigente de cada período (valor/meta*100),
 * no sobre el valor crudo capturado — un período sin meta resoluble no
 * produce % y queda fuera del bucket, sin importar `omitirPeriodosSinMeta`.
 *
 * Limitación conocida (documentada, no silenciosa): los indicadores
 * calculados (`esCalculado`) se excluyen del cálculo — evaluarlos requeriría
 * duplicar `EvaluadorFormulas` + el grafo de dependencias que hoy solo vive
 * en `ServicioSeguimiento`; queda para un batch posterior si hace falta.
 */
export class ServicioCortesMedicion extends ServicioBase {
  private readonly generadorPeriodos = new GeneradorPeriodos();

  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: ICorteMedicionRepository,
    private readonly indicadoresRepo: IIndicadorRepository,
    private readonly resultadosRepo: IResultadoRepository,
    private readonly metasRepo: IMetaRepository,
    private readonly periodicidadesRepo: IDefinicionPeriodicidadRepository,
    private readonly configuracionRepo: IConfiguracionRepository,
    private readonly usuariosRepo: IUsuarioRepository
  ) {
    super(ctx);
  }

  listar(): Promise<CorteMedicion[]> {
    return this.repo.listar();
  }

  async guardar(corte: CorteMedicion): Promise<CorteMedicion> {
    const errores: string[] = [];
    if (!corte.nombre.trim()) errores.push('El nombre es obligatorio.');
    if (!periodicidadCorteValida(corte.periodicidad)) {
      errores.push('La periodicidad del corte es obligatoria y debe ser superior al mes (Bimestral, Trimestral, Cuatrimestral, Semestral o Anual).');
    }
    if (!tipoAgregacionValido(corte.reglaGeneral)) errores.push('La regla general de agregación no es válida.');
    for (const [indicadorId, regla] of Object.entries(corte.reglasPorIndicador)) {
      if (!tipoAgregacionValido(regla)) errores.push(`La regla específica del indicador "${indicadorId}" no es válida.`);
    }
    const otros = await this.repo.listar();
    if (otros.some((c) => c.id !== corte.id && c.nombre.trim().toLowerCase() === corte.nombre.trim().toLowerCase())) {
      errores.push(`Ya existe un corte de medición con el nombre "${corte.nombre.trim()}".`);
    }
    if (errores.length > 0) throw new ValidacionError('Corte de medición inválido.', errores);

    const anterior = await this.repo.obtener(corte.id);
    const ahora = this.ctx.reloj.ahoraIso();
    const guardado: CorteMedicion = anterior
      ? { ...corte, creadoEn: anterior.creadoEn, actualizadoEn: ahora }
      : { ...corte, id: corte.id || this.ctx.ids.nuevoId(), creadoEn: ahora, actualizadoEn: ahora };
    await this.repo.guardar(guardado);
    await this.auditar(anterior ? 'Modificar' : 'Crear', 'CorteMedicion', guardado.id, null, null, guardado.nombre);
    return guardado;
  }

  async eliminar(id: string): Promise<void> {
    const corte = await this.repo.obtener(id);
    if (!corte) throw new EntidadNoEncontradaError('CorteMedicion', id);
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', 'CorteMedicion', id, null, null, corte.nombre);
  }

  /**
   * Para cada indicador visible (no calculado) y cada bucket YA CERRADO de
   * la periodicidad del corte, agrega los períodos más finos del indicador
   * cuya ventana [fechaInicio, fechaFin] cae dentro de la del bucket —
   * misma ventana calendario, nunca a caballo entre dos buckets. Un
   * indicador con periodicidad igual o más gruesa que la del corte (p. ej.
   * Semestral bajo un corte Trimestral) no tiene ningún período que quepa
   * entero dentro de un bucket más fino: simplemente no produce filas.
   */
  async calcular(id: string): Promise<ResultadoCorteMedicion[]> {
    const corte = await this.repo.obtener(id);
    if (!corte) throw new EntidadNoEncontradaError('CorteMedicion', id);

    const [config, indicadores, usuarios, definicionesLista] = await Promise.all([
      this.configuracionRepo.obtener(), this.indicadoresRepo.listar(), this.usuariosRepo.listar(),
      this.periodicidadesRepo.listar()
    ]);
    const definiciones = new Map(definicionesLista.map((d) => [d.id, d]));
    const usuariosPorId = new Map(usuarios.map((u) => [u.id, { equipoId: u.equipoId }]));
    const permisos = permisosActuales();
    const visibles = indicadores.filter(
      (i) => !i.esCalculado && puedeVerIndicador(permisos, { equipoEfectivoId: equipoEfectivo(i, usuariosPorId), responsable: i.responsable })
    );

    const hoy = this.ctx.reloj.hoyIso();
    const buckets = this.generadorPeriodos.periodosCerrados(config.anioInicial, corte.periodicidad, hoy);

    const resultados: ResultadoCorteMedicion[] = [];
    for (const indicador of visibles) {
      const definicion: DefinicionPeriodicidad | undefined =
        indicador.periodicidad === Periodicidad.Personalizada && indicador.periodicidadPersonalizadaId
          ? definiciones.get(indicador.periodicidadPersonalizadaId)
          : undefined;
      let periodosIndicador;
      try {
        periodosIndicador = this.generadorPeriodos.periodosCerrados(config.anioInicial, indicador.periodicidad, hoy, definicion);
      } catch {
        continue; // Personalizada sin definición resoluble.
      }
      if (periodosIndicador.length === 0) continue;

      const [valoresPorPeriodo, metasIndicador] = await Promise.all([
        this.resultadosRepo.resultadosGeneralPorIndicador(indicador.id),
        this.metasRepo.listarPorIndicador(indicador.id)
      ]);
      const valorPorPeriodoId = new Map(valoresPorPeriodo.map((v) => [v.periodoId, v.valor]));
      const regla = corte.reglasPorIndicador[indicador.id] ?? corte.reglaGeneral;

      for (const bucket of buckets) {
        const periodosDelBucket = periodosIndicador.filter((p) => p.fechaInicio >= bucket.fechaInicio && p.fechaFin <= bucket.fechaFin);
        if (periodosDelBucket.length === 0) continue;

        // Aclaración explícita del usuario: la agregación opera sobre el % de
        // cumplimiento respecto de la meta (valor/meta*100), no sobre el valor
        // crudo. Sin meta resoluble no hay % posible, así que el período queda
        // fuera de la agregación sin importar `omitirPeriodosSinMeta` — ese
        // toggle ya no puede "incluir sin meta" bajo este modelo, solo controla
        // (cuando SÍ hay meta) si se excluyen igual los períodos sin meta de
        // otros indicadores mezclados en la misma regla general; se deja intacto.
        const entradas: EntradaAgregable[] = [];
        for (const periodo of periodosDelBucket) {
          const valor = valorPorPeriodoId.get(periodo.id);
          if (valor == null) continue;
          const metaVigente = metaVigenteParaPeriodo(metasIndicador, 'GENERAL', periodo, definiciones);
          const meta = metaVigente?.valor ?? indicador.metaGlobal;
          const tieneMeta = meta != null;
          if (!tieneMeta || meta === 0) continue;
          entradas.push({ valor: (valor / meta) * 100, tieneMeta });
        }
        if (entradas.length === 0) continue;

        let valorAgregado = agregar(regla, entradas);
        if (corte.acotarAl100 && valorAgregado != null) valorAgregado = Math.min(valorAgregado, 100);

        resultados.push({
          indicadorId: indicador.id,
          nombre: indicador.nombre,
          regla,
          periodoId: bucket.id,
          periodoEtiqueta: bucket.etiqueta,
          valorAgregado,
          periodosConsiderados: entradas.length
        });
      }
    }
    return resultados;
  }
}
