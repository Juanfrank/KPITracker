import type {
  AliasDesagregacionOrigen, Atributo, ElementoLista, Indicador, Lista, Meta, ReglaNegocio, TypeRegistry
} from '@domain/index';
import {
  EvaluadorFormulas, Periodicidad, ValidacionError, ValidadorAtributos, construirContextoIndicador,
  signosAgrupacionBalanceados
} from '@domain/index';
import type {
  IAliasDesagregacionOrigenRepository, IAtributoRepository, IDefinicionPeriodicidadRepository,
  IIndicadorRepository, IListaRepository, IMetaRepository, IReglaRepository, ValorAtributoEntidad
} from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';
import { mapaValoresDesdeEntidad } from './valoresEav';

/** Mapeo de campos de Indicador -> nombre de columna del archivo importado (undefined = no mapeado). */
export interface MapeoImportacionIndicadores {
  codigo?: string;
  nombre: string;
  definicion: string;
  periodicidad?: string;
  lineaBase?: string;
  metaGlobal?: string;
  unidadMedida?: string;
}

export interface ErrorFilaImportacion {
  fila: number;
  mensaje: string;
}

export interface ResultadoImportacionIndicadores {
  creados: number;
  errores: ErrorFilaImportacion[];
}

export interface GuardarIndicadorInput {
  indicador: Indicador;
  /** Valores de atributos dinámicos del indicador (EAV); entidadId se fuerza al id resuelto del indicador. */
  valores: ValorAtributoEntidad[];
}

/**
 * CRUD de indicadores con validación de mínimos obligatorios, atributos
 * dinámicos (visibilidad/obligatoriedad declarativas) y reglas de negocio
 * `ValidacionCruzada`. La persistencia del indicador y de sus valores EAV
 * se hace en un mismo caso de uso para poder validar todo antes de escribir
 * nada.
 */
export class ServicioIndicadores extends ServicioBase {
  private readonly formulas = new EvaluadorFormulas();

  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IIndicadorRepository,
    private readonly atributosRepo: IAtributoRepository,
    private readonly reglasRepo: IReglaRepository,
    private readonly periodicidadesRepo: IDefinicionPeriodicidadRepository,
    private readonly tipos: TypeRegistry
  ) {
    super(ctx);
  }

  listar(): Promise<Indicador[]> {
    return this.repo.listar();
  }

  obtener(id: string): Promise<Indicador | null> {
    return this.repo.obtener(id);
  }

  async guardar(input: GuardarIndicadorInput): Promise<Indicador> {
    const { indicador, valores } = input;
    const errores: string[] = [];
    if (!indicador.nombre.trim()) errores.push('El nombre del indicador es obligatorio.');
    if (!indicador.definicion.trim()) errores.push('La definición es obligatoria.');
    if (!indicador.periodicidad) errores.push('La periodicidad es obligatoria.');
    if (indicador.periodicidad === Periodicidad.Personalizada) {
      if (!indicador.periodicidadPersonalizadaId) {
        errores.push('Debe seleccionar una definición de periodicidad personalizada.');
      } else if (!(await this.periodicidadesRepo.obtener(indicador.periodicidadPersonalizadaId))) {
        errores.push('La definición de periodicidad personalizada seleccionada no existe.');
      }
    }
    if (indicador.esCalculado) {
      if (!indicador.formula?.trim()) {
        errores.push('Un indicador calculado requiere una fórmula.');
      } else {
        try {
          this.formulas.validar(indicador.formula);
          const otros = await this.repo.listar();
          const formulasPorCodigo = new Map(
            otros.filter((o) => o.esCalculado && o.formula && o.id !== indicador.id).map((o) => [o.codigo, o.formula as string])
          );
          if (indicador.codigo.trim() && this.formulas.formaCiclo(indicador.codigo.trim(), indicador.formula, formulasPorCodigo)) {
            errores.push('La fórmula genera una referencia circular entre indicadores calculados.');
          }
        } catch (err) {
          errores.push(err instanceof Error ? err.message : 'Fórmula inválida.');
        }
      }
    }
    if (indicador.codigo.trim()) {
      const duplicado = await this.repo.buscarPorCodigo(indicador.codigo.trim(), indicador.id || undefined);
      if (duplicado) errores.push(`Ya existe un indicador con el código "${indicador.codigo.trim()}".`);
    }
    if (indicador.formaCalculo?.trim() && !signosAgrupacionBalanceados(indicador.formaCalculo)) {
      errores.push('La forma de cálculo tiene signos de agrupación (paréntesis, corchetes o llaves) sin cerrar o desbalanceados.');
    }
    if (errores.length > 0) throw new ValidacionError('Indicador inválido.', errores);

    const anterior = await this.repo.obtener(indicador.id);
    const ahora = this.ctx.reloj.ahoraIso();
    const guardado: Indicador = anterior
      ? { ...indicador, creadoEn: anterior.creadoEn, actualizadoEn: ahora }
      : { ...indicador, id: indicador.id || this.ctx.ids.nuevoId(), creadoEn: ahora, actualizadoEn: ahora };

    const [atributos, reglas] = await Promise.all([
      this.atributosRepo.listar('Indicador'),
      this.reglasRepo.listar('Indicador')
    ]);
    const valoresMap = mapaValoresDesdeEntidad(valores);
    const contexto = construirContextoIndicador(guardado, atributos, valoresMap);
    const validador = new ValidadorAtributos(this.tipos);

    const erroresAtributos = validador.validar(atributos, valoresMap, contexto, reglas);
    if (erroresAtributos.length > 0) {
      throw new ValidacionError(
        'Hay errores en los atributos del indicador.',
        erroresAtributos.flatMap((r) => r.errores.map((e) => e.mensaje))
      );
    }
    const incumplidas = validador.validarCruzadas(reglas, 'Indicador', contexto);
    if (incumplidas.length > 0) {
      throw new ValidacionError('El indicador no cumple una o más reglas de negocio.', incumplidas);
    }

    await this.repo.guardar(guardado);
    await this.auditar(
      anterior ? 'Modificar' : 'Crear', 'Indicador', guardado.id, null,
      anterior ? JSON.stringify(anterior) : null, JSON.stringify(guardado)
    );

    for (const valor of valores) {
      await this.atributosRepo.guardarValor({ ...valor, entidadTipo: 'Indicador', entidadId: guardado.id });
    }

    this.sincronizarExport();
    return guardado;
  }

  async eliminar(id: string): Promise<void> {
    const anterior = await this.repo.obtener(id);
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', 'Indicador', id, null, anterior ? JSON.stringify(anterior) : null, null);
    this.sincronizarExport();
  }

  /**
   * Reasigna responsable y/o categoría a varios indicadores de una vez
   * (acción masiva desde Seguimiento). `undefined` en un campo significa
   * "no tocar"; `null` significa "quitar la asignación actual".
   */
  async reasignarMasivo(
    indicadorIds: string[],
    cambios: { responsable?: string | null; categoria?: string | null }
  ): Promise<void> {
    if (indicadorIds.length === 0) return;
    const ahora = this.ctx.reloj.ahoraIso();
    for (const id of indicadorIds) {
      const actual = await this.repo.obtener(id);
      if (!actual) continue;
      const actualizado: Indicador = {
        ...actual,
        responsable: cambios.responsable === undefined ? actual.responsable : cambios.responsable,
        categoria: cambios.categoria === undefined ? actual.categoria : cambios.categoria,
        actualizadoEn: ahora
      };
      await this.repo.guardar(actualizado);
      await this.auditar('Modificar', 'Indicador', id, 'reasignacionMasiva',
        JSON.stringify({ responsable: actual.responsable, categoria: actual.categoria }),
        JSON.stringify({ responsable: actualizado.responsable, categoria: actualizado.categoria }));
    }
    this.sincronizarExport();
  }

  /**
   * Crea indicadores en lote a partir de filas de un archivo (Excel/CSV) ya
   * leídas y un mapeo de columnas. Cada fila se valida y guarda de forma
   * independiente: una fila inválida no bloquea el resto, y sus motivos se
   * reportan en `errores`.
   */
  async importarExcel(
    filas: Record<string, string>[],
    mapeo: MapeoImportacionIndicadores
  ): Promise<ResultadoImportacionIndicadores> {
    const errores: ErrorFilaImportacion[] = [];
    let creados = 0;

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const numeroFila = i + 2; // +1 por índice 0-based, +1 por la fila de encabezados.
      if (!fila) continue;
      try {
        const nombre = mapeo.nombre ? (fila[mapeo.nombre] ?? '').trim() : '';
        const definicion = mapeo.definicion ? (fila[mapeo.definicion] ?? '').trim() : '';
        const codigo = mapeo.codigo ? (fila[mapeo.codigo] ?? '').trim() : '';
        const periodicidadTexto = mapeo.periodicidad ? (fila[mapeo.periodicidad] ?? '').trim() : '';
        const periodicidad = (Object.values(Periodicidad) as string[]).includes(periodicidadTexto)
          ? (periodicidadTexto as Periodicidad)
          : Periodicidad.Mensual;
        const lineaBaseTexto = mapeo.lineaBase ? (fila[mapeo.lineaBase] ?? '').trim() : '';
        const metaGlobalTexto = mapeo.metaGlobal ? (fila[mapeo.metaGlobal] ?? '').trim() : '';

        if (!nombre) throw new ValidacionError(`Fila ${numeroFila}: falta el nombre.`);
        if (!definicion) throw new ValidacionError(`Fila ${numeroFila}: falta la definición.`);

        const ahora = this.ctx.reloj.ahoraIso();
        const indicador: Indicador = {
          id: this.ctx.ids.nuevoId(),
          codigo,
          nombre,
          definicion,
          formaCalculo: null,
          periodicidad,
          periodicidadPersonalizadaId: null,
          lineaBase: lineaBaseTexto ? Number(lineaBaseTexto) : null,
          lineaBasePeriodoId: null,
          metaGlobal: metaGlobalTexto ? Number(metaGlobalTexto) : null,
          desagregaciones: [],
          estado: 'Borrador',
          responsable: null,
          categoria: null,
          unidadMedida: mapeo.unidadMedida ? (fila[mapeo.unidadMedida] ?? '').trim() || null : null,
          esCalculado: false,
          formula: null,
          creadoEn: ahora,
          actualizadoEn: ahora
        };

        await this.guardar({ indicador, valores: [] });
        creados++;
      } catch (err) {
        const mensaje = err instanceof ValidacionError ? err.detalles?.[0] ?? err.message : String(err);
        errores.push({ fila: numeroFila, mensaje: mensaje ?? 'Error desconocido.' });
      }
    }

    return { creados, errores };
  }
}

/** Administración de atributos dinámicos y sus valores EAV. */
export class ServicioAtributos extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IAtributoRepository
  ) {
    super(ctx);
  }

  listar(entidad?: string): Promise<Atributo[]> {
    return this.repo.listar(entidad);
  }

  async guardar(atributo: Atributo): Promise<Atributo> {
    if (!atributo.nombre.trim()) throw new ValidacionError('El nombre del atributo es obligatorio.');
    const anterior = await this.repo.obtener(atributo.id);
    const ahora = this.ctx.reloj.ahoraIso();
    const guardado: Atributo = anterior
      ? { ...atributo, creadoEn: anterior.creadoEn, actualizadoEn: ahora }
      : { ...atributo, id: atributo.id || this.ctx.ids.nuevoId(), creadoEn: ahora, actualizadoEn: ahora };
    await this.repo.guardar(guardado);
    await this.auditar(anterior ? 'Modificar' : 'Crear', 'Atributo', guardado.id, null,
      anterior ? JSON.stringify(anterior) : null, JSON.stringify(guardado));
    return guardado;
  }

  async eliminar(id: string): Promise<void> {
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', 'Atributo', id);
  }

  obtenerValores(entidadTipo: string, entidadId: string): Promise<ValorAtributoEntidad[]> {
    return this.repo.obtenerValores(entidadTipo, entidadId);
  }

  async guardarValor(valor: ValorAtributoEntidad): Promise<void> {
    await this.repo.guardarValor(valor);
    await this.auditar('Modificar', 'ValorAtributo', `${valor.entidadTipo}:${valor.entidadId}:${valor.atributoId}`,
      valor.atributoId, null, valor.valorTexto ?? valor.valorNumero ?? valor.valorFecha ?? valor.valorBooleano);
    this.sincronizarExport();
  }
}

/** Administración de listas de selección (incluidas jerárquicas). */
export class ServicioListas extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IListaRepository,
    private readonly aliasRepo: IAliasDesagregacionOrigenRepository
  ) {
    super(ctx);
  }

  listar(): Promise<Lista[]> {
    return this.repo.listar();
  }

  async guardar(lista: Lista): Promise<Lista> {
    if (!lista.nombre.trim()) throw new ValidacionError('El nombre de la lista es obligatorio.');
    const prefijo = lista.prefijo.trim().toUpperCase();
    if (!prefijo) throw new ValidacionError('El prefijo de la lista es obligatorio.');
    if (!/^[A-Z]+$/.test(prefijo)) {
      throw new ValidacionError('El prefijo debe ser alfabético, en mayúsculas, sin espacios ni caracteres especiales.');
    }
    const otras = await this.repo.listar();
    if (otras.some((l) => l.id !== lista.id && l.prefijo.toUpperCase() === prefijo)) {
      throw new ValidacionError(`Ya existe una lista con el prefijo "${prefijo}".`);
    }
    const anterior = await this.repo.obtener(lista.id);
    const ahora = this.ctx.reloj.ahoraIso();
    const guardada: Lista = anterior
      ? { ...lista, prefijo, creadoEn: anterior.creadoEn, actualizadoEn: ahora, version: anterior.version + 1 }
      : { ...lista, prefijo, id: lista.id || this.ctx.ids.nuevoId(), creadoEn: ahora, actualizadoEn: ahora, version: 1 };
    await this.repo.guardar(guardada);
    await this.auditar(anterior ? 'Modificar' : 'Crear', 'Lista', guardada.id);
    return guardada;
  }

  async eliminar(id: string): Promise<void> {
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', 'Lista', id);
  }

  listarElementos(listaId: string): Promise<ElementoLista[]> {
    return this.repo.listarElementos(listaId);
  }

  async guardarElemento(elemento: ElementoLista): Promise<ElementoLista> {
    if (!elemento.codigo.trim()) throw new ValidacionError('El código del elemento es obligatorio.');
    if (!elemento.nombre.trim()) throw new ValidacionError('El nombre del elemento es obligatorio.');
    const guardado: ElementoLista = { ...elemento, id: elemento.id || this.ctx.ids.nuevoId() };
    await this.repo.guardarElemento(guardado);
    await this.auditar('Modificar', 'ElementoLista', guardado.id, null, null, `${guardado.codigo}: ${guardado.nombre}`);
    return guardado;
  }

  async eliminarElemento(id: string): Promise<void> {
    await this.repo.eliminarElemento(id);
    await this.auditar('Eliminar', 'ElementoLista', id);
  }

  /** Alias con el que esta lista se identifica en los datos de cada origen automático (reutilizable entre indicadores). */
  listarAliasOrigen(listaId: string): Promise<AliasDesagregacionOrigen[]> {
    return this.aliasRepo.listarPorLista(listaId);
  }

  async guardarAliasOrigen(alias: AliasDesagregacionOrigen): Promise<AliasDesagregacionOrigen> {
    if (!alias.alias.trim()) throw new ValidacionError('El alias no puede estar vacío.');
    const anterior = await this.aliasRepo.obtener(alias.listaId, alias.origenAutomaticoId);
    const ahora = this.ctx.reloj.ahoraIso();
    const guardado: AliasDesagregacionOrigen = anterior
      ? { ...alias, id: anterior.id, creadoEn: anterior.creadoEn, actualizadoEn: ahora }
      : { ...alias, id: alias.id || this.ctx.ids.nuevoId(), creadoEn: ahora, actualizadoEn: ahora };
    await this.aliasRepo.guardar(guardado);
    await this.auditar(anterior ? 'Modificar' : 'Crear', 'AliasDesagregacionOrigen', guardado.id, null, null, guardado.alias);
    return guardado;
  }

  async eliminarAliasOrigen(id: string): Promise<void> {
    await this.aliasRepo.eliminar(id);
    await this.auditar('Eliminar', 'AliasDesagregacionOrigen', id);
  }
}

/** Metas por indicador y desagregación. */
export class ServicioMetas extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IMetaRepository,
    private readonly periodicidadesRepo: IDefinicionPeriodicidadRepository
  ) {
    super(ctx);
  }

  listarPorIndicador(indicadorId: string): Promise<Meta[]> {
    return this.repo.listarPorIndicador(indicadorId);
  }

  async guardar(meta: Meta): Promise<Meta> {
    if (meta.periodicidadMedicion === Periodicidad.Personalizada) {
      if (!meta.periodicidadPersonalizadaId) {
        throw new ValidacionError('Debe seleccionar una definición de periodicidad personalizada para la meta.');
      }
      if (!(await this.periodicidadesRepo.obtener(meta.periodicidadPersonalizadaId))) {
        throw new ValidacionError('La definición de periodicidad personalizada seleccionada no existe.');
      }
    }
    const ahora = this.ctx.reloj.ahoraIso();
    const guardada: Meta = {
      ...meta,
      id: meta.id || this.ctx.ids.nuevoId(),
      creadoEn: meta.creadoEn || ahora,
      actualizadoEn: ahora
    };
    await this.repo.guardar(guardada);
    await this.auditar('Modificar', 'Meta', guardada.id, null, null, JSON.stringify(guardada));
    this.sincronizarExport();
    return guardada;
  }

  async eliminar(id: string): Promise<void> {
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', 'Meta', id);
    this.sincronizarExport();
  }
}

/** Reglas de negocio declarativas. */
export class ServicioReglas extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IReglaRepository
  ) {
    super(ctx);
  }

  listar(entidad?: string): Promise<ReglaNegocio[]> {
    return this.repo.listar(entidad);
  }

  async guardar(regla: ReglaNegocio): Promise<ReglaNegocio> {
    if (!regla.nombre.trim()) throw new ValidacionError('El nombre de la regla es obligatorio.');
    const ahora = this.ctx.reloj.ahoraIso();
    const guardada: ReglaNegocio = {
      ...regla,
      id: regla.id || this.ctx.ids.nuevoId(),
      creadoEn: regla.creadoEn || ahora,
      actualizadoEn: ahora
    };
    await this.repo.guardar(guardada);
    await this.auditar('Modificar', 'ReglaNegocio', guardada.id, null, null, JSON.stringify(guardada.condicion));
    return guardada;
  }

  async eliminar(id: string): Promise<void> {
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', 'ReglaNegocio', id);
  }
}
