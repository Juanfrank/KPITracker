import type {
  Atributo, ElementoLista, Indicador, Lista, Meta, ReglaNegocio, TypeRegistry
} from '@domain/index';
import { Periodicidad, ValidacionError, ValidadorAtributos, construirContextoIndicador } from '@domain/index';
import type {
  IAtributoRepository, IDefinicionPeriodicidadRepository, IIndicadorRepository, IListaRepository,
  IMetaRepository, IReglaRepository, ValorAtributoEntidad
} from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';
import { mapaValoresDesdeEntidad } from './valoresEav';

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
    private readonly repo: IListaRepository
  ) {
    super(ctx);
  }

  listar(): Promise<Lista[]> {
    return this.repo.listar();
  }

  async guardar(lista: Lista): Promise<Lista> {
    if (!lista.nombre.trim()) throw new ValidacionError('El nombre de la lista es obligatorio.');
    const anterior = await this.repo.obtener(lista.id);
    const ahora = this.ctx.reloj.ahoraIso();
    const guardada: Lista = anterior
      ? { ...lista, creadoEn: anterior.creadoEn, actualizadoEn: ahora, version: anterior.version + 1 }
      : { ...lista, id: lista.id || this.ctx.ids.nuevoId(), creadoEn: ahora, actualizadoEn: ahora, version: 1 };
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
    const guardado: ElementoLista = { ...elemento, id: elemento.id || this.ctx.ids.nuevoId() };
    await this.repo.guardarElemento(guardado);
    await this.auditar('Modificar', 'ElementoLista', guardado.id, null, null, `${guardado.codigo}: ${guardado.descripcion}`);
    return guardado;
  }

  async eliminarElemento(id: string): Promise<void> {
    await this.repo.eliminarElemento(id);
    await this.auditar('Eliminar', 'ElementoLista', id);
  }
}

/** Metas por indicador y desagregación. */
export class ServicioMetas extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IMetaRepository
  ) {
    super(ctx);
  }

  listarPorIndicador(indicadorId: string): Promise<Meta[]> {
    return this.repo.listarPorIndicador(indicadorId);
  }

  async guardar(meta: Meta): Promise<Meta> {
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
