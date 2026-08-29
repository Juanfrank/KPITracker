import {
  EntidadNoEncontradaError, GeneradorPeriodos, Periodicidad, ValidacionError, agregar, equipoEfectivo,
  metaVigenteParaPeriodo, puedeVerIndicador, tipoAgregacionValido
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
 * "Cortes de medición" (Batch Y, pedido explícito del usuario): momentos
 * globales donde se agrega, indicador por indicador, todo lo capturado desde
 * el corte anterior hasta la fecha de este, con una regla de agregación
 * (general o específica por indicador). No modifica ningún resultado — es
 * puramente de LECTURA/reportería, calculado bajo demanda (`calcular`).
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(corte.fecha)) errores.push('La fecha de corte es obligatoria y debe ser válida.');
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
   * Agrega, para cada indicador visible (no calculado), sus períodos
   * cerrados entre el corte cronológicamente anterior (exclusivo) y este
   * (inclusive) — el primer corte de todos agrega "desde siempre".
   */
  async calcular(id: string): Promise<ResultadoCorteMedicion[]> {
    const corte = await this.repo.obtener(id);
    if (!corte) throw new EntidadNoEncontradaError('CorteMedicion', id);

    const todos = await this.repo.listar();
    const fechaDesde = todos
      .filter((c) => c.fecha < corte.fecha)
      .map((c) => c.fecha)
      .sort()
      .at(-1) ?? null;

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

    const resultados: ResultadoCorteMedicion[] = [];
    for (const indicador of visibles) {
      const definicion: DefinicionPeriodicidad | undefined =
        indicador.periodicidad === Periodicidad.Personalizada && indicador.periodicidadPersonalizadaId
          ? definiciones.get(indicador.periodicidadPersonalizadaId)
          : undefined;
      let periodos;
      try {
        periodos = this.generadorPeriodos.periodosDisponibles(config.anioInicial, indicador.periodicidad, corte.fecha, definicion);
      } catch {
        continue; // Personalizada sin definición resoluble.
      }
      periodos = periodos.filter((p) => p.fechaFin <= corte.fecha && (fechaDesde == null || p.fechaFin > fechaDesde));
      if (periodos.length === 0) continue;

      const [valoresPorPeriodo, metasIndicador] = await Promise.all([
        this.resultadosRepo.resultadosGeneralPorIndicador(indicador.id),
        this.metasRepo.listarPorIndicador(indicador.id)
      ]);
      const valorPorPeriodoId = new Map(valoresPorPeriodo.map((v) => [v.periodoId, v.valor]));

      const entradas: EntradaAgregable[] = [];
      for (const periodo of periodos) {
        const valor = valorPorPeriodoId.get(periodo.id);
        if (valor == null) continue;
        const tieneMeta = metaVigenteParaPeriodo(metasIndicador, 'GENERAL', periodo, definiciones) != null;
        entradas.push({ valor, tieneMeta });
      }

      const regla = corte.reglasPorIndicador[indicador.id] ?? corte.reglaGeneral;
      resultados.push({
        indicadorId: indicador.id,
        nombre: indicador.nombre,
        regla,
        valorAgregado: agregar(regla, entradas),
        periodosConsiderados: periodos.length
      });
    }
    return resultados;
  }
}
