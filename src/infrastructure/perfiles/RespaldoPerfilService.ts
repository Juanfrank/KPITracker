import type {
  IAliasDesagregacionOrigenRepository, IAtributoRepository, IAutomatizacionIndicadorRepository,
  ICatalogoRepository, IConfiguracionRepository, IIndicadorRepository, IListaRepository, IMetaRepository,
  IReglaRepository
} from '@application/ports/index';
import type { Categoria, DefinicionPeriodicidad, OrigenAutomatico, Responsable } from '@domain/index';
import { ValidacionError } from '@domain/index';
import type {
  ArchivoRespaldo, CategoriaRespaldo, CategoriaResumen, ItemRespaldo, ResultadoImportacionRespaldo, ResumenRespaldo,
  SeleccionRespaldo
} from './esquemaRespaldo';
import { ETIQUETAS_CATEGORIA, ORDEN_IMPORTACION, RESPALDO_FORMATO, RESPALDO_SCHEMA_VERSION, esquemaRespaldo, migracionesRespaldo } from './esquemaRespaldo';

export interface ReposRespaldoPerfil {
  configuracion: IConfiguracionRepository;
  indicadores: IIndicadorRepository;
  atributos: IAtributoRepository;
  listas: IListaRepository;
  metas: IMetaRepository;
  reglas: IReglaRepository;
  periodicidades: ICatalogoRepository<DefinicionPeriodicidad>;
  responsables: ICatalogoRepository<Responsable>;
  categorias: ICatalogoRepository<Categoria>;
  origenesAutomaticos: ICatalogoRepository<OrigenAutomatico>;
  automatizaciones: IAutomatizacionIndicadorRepository;
  aliasDesagregacionOrigen: IAliasDesagregacionOrigenRepository;
}

/** Fila mínima con id — todas las categorías del respaldo la satisfacen. */
type FilaConId = Record<string, unknown> & { id?: unknown };

function idDe(fila: FilaConId): string {
  return String(fila.id ?? '');
}

/**
 * Respaldo completo del perfil ACTIVO (exportar/importar siempre operan
 * sobre el perfil en uso — para tocar otro primero hay que cambiarse a
 * él, ver Batch P) con importación selectiva por categoría e ítem.
 * Complementa, sin reemplazar, la configuración portable existente
 * (`ConfigPortableService`): cubre además orígenes automáticos,
 * automatizaciones y alias de desagregación, e incluye los ítems con
 * borrado lógico (`eliminado`) para que el respaldo sea fiel.
 */
export class RespaldoPerfilService {
  constructor(
    private readonly repos: ReposRespaldoPerfil,
    private readonly appVersion: string | null
  ) {}

  async exportar(): Promise<string> {
    const [config, periodicidades, responsables, categorias, listas, atributos, origenes, indicadores, reglas] =
      await Promise.all([
        this.repos.configuracion.obtener(),
        this.repos.periodicidades.listar(true),
        this.repos.responsables.listar(true),
        this.repos.categorias.listar(true),
        this.repos.listas.listar(true),
        this.repos.atributos.listar(undefined, true),
        this.repos.origenesAutomaticos.listar(true),
        this.repos.indicadores.listar(),
        this.repos.reglas.listar(undefined, true)
      ]);

    const elementos = (await Promise.all(listas.map((l) => this.repos.listas.listarElementos(l.id)))).flat();
    const metas = (await Promise.all(indicadores.map((i) => this.repos.metas.listarPorIndicador(i.id)))).flat();
    const automatizaciones = await this.repos.automatizaciones.listarTodas();
    const aliasDesagregacion = await this.repos.aliasDesagregacionOrigen.listarTodos();

    const archivo: ArchivoRespaldo = {
      formato: RESPALDO_FORMATO,
      schemaVersion: RESPALDO_SCHEMA_VERSION,
      exportadoEn: new Date().toISOString(),
      appVersion: this.appVersion ?? undefined,
      configuracionGeneral: config as unknown as Record<string, unknown>,
      periodicidades: periodicidades as unknown as Record<string, unknown>[],
      responsables: responsables as unknown as Record<string, unknown>[],
      categorias: categorias as unknown as Record<string, unknown>[],
      listas: listas as unknown as Record<string, unknown>[],
      elementos: elementos as unknown as Record<string, unknown>[],
      atributos: atributos as unknown as Record<string, unknown>[],
      origenes: origenes as unknown as Record<string, unknown>[],
      indicadores: indicadores as unknown as Record<string, unknown>[],
      metas: metas as unknown as Record<string, unknown>[],
      reglas: reglas as unknown as Record<string, unknown>[],
      automatizaciones: automatizaciones as unknown as Record<string, unknown>[],
      aliasDesagregacion: aliasDesagregacion as unknown as Record<string, unknown>[]
    };
    return JSON.stringify(archivo, null, 2);
  }

  /** Parsea, valida el formato y aplica migraciones — sin escribir nada. */
  private parsear(json: string): ArchivoRespaldo {
    let bruto: unknown;
    try {
      bruto = JSON.parse(json);
    } catch {
      throw new ValidacionError('El archivo no es un JSON válido.');
    }
    if (typeof bruto === 'object' && bruto !== null && 'formato' in bruto && (bruto as { formato: unknown }).formato === 'kpitracker-config') {
      throw new ValidacionError(
        'Este archivo es una configuración portable ("kpitracker-config"), no un respaldo de perfil. ' +
          'Use "Configuración portable" (en Admin) para importarlo.'
      );
    }
    const resultado = esquemaRespaldo.safeParse(bruto);
    if (!resultado.success) {
      throw new ValidacionError('El archivo no tiene el formato de un respaldo de perfil de KPITracker.');
    }
    let archivo = resultado.data;
    if (archivo.schemaVersion > RESPALDO_SCHEMA_VERSION) {
      throw new ValidacionError(
        `El respaldo es de una versión más nueva (${archivo.schemaVersion}) que esta aplicación (${RESPALDO_SCHEMA_VERSION}).`
      );
    }
    while (archivo.schemaVersion < RESPALDO_SCHEMA_VERSION) {
      const migrar = migracionesRespaldo[archivo.schemaVersion];
      if (!migrar) throw new ValidacionError(`No existe migración desde la versión ${archivo.schemaVersion}.`);
      archivo = migrar(archivo);
    }
    return archivo;
  }

  leer(json: string): ResumenRespaldo {
    const archivo = this.parsear(json);

    const nombreIndicador = new Map(archivo.indicadores.map((i) => [idDe(i), String(i.nombre ?? '')]));
    const nombreLista = new Map(archivo.listas.map((l) => [idDe(l), String(l.nombre ?? '')]));
    const nombreOrigen = new Map(archivo.origenes.map((o) => [idDe(o), String(o.nombre ?? '')]));
    const elementosPorLista = new Map<string, number>();
    for (const el of archivo.elementos) {
      const listaId = String(el.listaId ?? '');
      elementosPorLista.set(listaId, (elementosPorLista.get(listaId) ?? 0) + 1);
    }

    const categorias: CategoriaResumen[] = ORDEN_IMPORTACION.map((categoria) => {
      if (categoria === 'configuracionGeneral') {
        return { categoria, etiqueta: ETIQUETAS_CATEGORIA[categoria], items: [], total: 1, atomica: true };
      }
      const filas = archivo[categoria] as FilaConId[];
      const items: ItemRespaldo[] = filas.map((f) => itemDe(categoria, f, { nombreIndicador, nombreLista, nombreOrigen, elementosPorLista }));
      return { categoria, etiqueta: ETIQUETAS_CATEGORIA[categoria], items, total: items.length, atomica: false };
    });

    return { schemaVersion: archivo.schemaVersion, exportadoEn: archivo.exportadoEn, appVersion: archivo.appVersion ?? null, categorias };
  }

  async importar(json: string, seleccion: SeleccionRespaldo): Promise<ResultadoImportacionRespaldo> {
    const archivo = this.parsear(json);
    const advertencias: string[] = [];
    const importados = ceros();
    const omitidos = ceros();

    const idsSeleccionados = (categoria: CategoriaRespaldo, filas: FilaConId[]): FilaConId[] => {
      const sel = seleccion[categoria];
      if (!sel) return [];
      if (sel === 'todos') return filas;
      const idsElegidos = new Set(sel);
      return filas.filter((f) => idsElegidos.has(idDe(f)));
    };

    // configuracionGeneral: atómica, todo o nada.
    if (seleccion.configuracionGeneral) {
      await this.repos.configuracion.guardar(archivo.configuracionGeneral as never);
      importados.configuracionGeneral = 1;
    }

    for (const periodicidad of idsSeleccionados('periodicidades', archivo.periodicidades as FilaConId[])) {
      await this.repos.periodicidades.guardar(periodicidad as never);
      importados.periodicidades++;
    }

    for (const responsable of idsSeleccionados('responsables', archivo.responsables as FilaConId[])) {
      await this.repos.responsables.guardar(conEliminadoPorDefecto(responsable) as never);
      importados.responsables++;
    }

    for (const categoria of idsSeleccionados('categorias', archivo.categorias as FilaConId[])) {
      await this.repos.categorias.guardar(conEliminadoPorDefecto(categoria) as never);
      importados.categorias++;
    }

    const listasSeleccionadas = idsSeleccionados('listas', archivo.listas as FilaConId[]);
    for (const lista of listasSeleccionadas) {
      await this.repos.listas.guardar(conEliminadoPorDefecto(lista) as never);
      importados.listas++;
      const listaId = idDe(lista);
      for (const elemento of archivo.elementos.filter((e) => String(e.listaId ?? '') === listaId)) {
        await this.repos.listas.guardarElemento(elemento as never);
      }
    }

    for (const atributo of idsSeleccionados('atributos', archivo.atributos as FilaConId[])) {
      const listaId = atributo.listaId == null ? null : String(atributo.listaId);
      if (listaId && !(await existe(this.repos.listas, listaId))) {
        advertencias.push(`Atributo "${String(atributo.nombre ?? idDe(atributo))}" omitido: su lista de selección no existe en el destino.`);
        omitidos.atributos++;
        continue;
      }
      await this.repos.atributos.guardar(conEliminadoPorDefecto(atributo) as never);
      importados.atributos++;
    }

    for (const origen of idsSeleccionados('origenes', archivo.origenes as FilaConId[])) {
      await this.repos.origenesAutomaticos.guardar(conEliminadoPorDefecto(origen) as never);
      importados.origenes++;
    }

    for (const indicador of idsSeleccionados('indicadores', archivo.indicadores as FilaConId[])) {
      const responsableId = indicador.responsable == null ? null : String(indicador.responsable);
      const categoriaId = indicador.categoria == null ? null : String(indicador.categoria);
      const periodicidadId = indicador.periodicidadPersonalizadaId == null ? null : String(indicador.periodicidadPersonalizadaId);
      if (
        (responsableId && !(await existe(this.repos.responsables, responsableId))) ||
        (categoriaId && !(await existe(this.repos.categorias, categoriaId))) ||
        (periodicidadId && !(await existe(this.repos.periodicidades, periodicidadId)))
      ) {
        advertencias.push(`Indicador "${String(indicador.nombre ?? idDe(indicador))}" omitido: referencia un responsable, categoría o periodicidad que no existe en el destino.`);
        omitidos.indicadores++;
        continue;
      }
      await this.repos.indicadores.guardar(indicador as never);
      importados.indicadores++;
    }

    for (const meta of idsSeleccionados('metas', archivo.metas as FilaConId[])) {
      const indicadorId = String(meta.indicadorId ?? '');
      if (!(await existe(this.repos.indicadores, indicadorId))) {
        advertencias.push(`Meta omitida: su indicador no existe en el destino.`);
        omitidos.metas++;
        continue;
      }
      await this.repos.metas.guardar(meta as never);
      importados.metas++;
    }

    for (const regla of idsSeleccionados('reglas', archivo.reglas as FilaConId[])) {
      const atributoId = regla.atributoObjetivoId == null ? null : String(regla.atributoObjetivoId);
      if (atributoId && !(await existe(this.repos.atributos, atributoId))) {
        advertencias.push(`Regla "${String(regla.nombre ?? idDe(regla))}" omitida: su atributo objetivo no existe en el destino.`);
        omitidos.reglas++;
        continue;
      }
      await this.repos.reglas.guardar(conEliminadoPorDefecto(regla) as never);
      importados.reglas++;
    }

    for (const auto of idsSeleccionados('automatizaciones', archivo.automatizaciones as FilaConId[])) {
      const indicadorId = String(auto.indicadorId ?? '');
      const origenId = String(auto.origenAutomaticoId ?? '');
      if (!(await existe(this.repos.indicadores, indicadorId)) || !(await existe(this.repos.origenesAutomaticos, origenId))) {
        advertencias.push('Automatización omitida: su indicador o su origen automático no existe en el destino.');
        omitidos.automatizaciones++;
        continue;
      }
      await this.repos.automatizaciones.guardar(auto as never);
      importados.automatizaciones++;
    }

    for (const alias of idsSeleccionados('aliasDesagregacion', archivo.aliasDesagregacion as FilaConId[])) {
      const listaId = String(alias.listaId ?? '');
      const origenId = String(alias.origenAutomaticoId ?? '');
      if (!(await existe(this.repos.listas, listaId)) || !(await existe(this.repos.origenesAutomaticos, origenId))) {
        advertencias.push('Alias de desagregación omitido: su lista o su origen automático no existe en el destino.');
        omitidos.aliasDesagregacion++;
        continue;
      }
      await this.repos.aliasDesagregacionOrigen.guardar(alias as never);
      importados.aliasDesagregacion++;
    }

    return { advertencias, importados, omitidos };
  }
}

function ceros(): Record<CategoriaRespaldo, number> {
  const registro = {} as Record<CategoriaRespaldo, number>;
  for (const categoria of ORDEN_IMPORTACION) registro[categoria] = 0;
  return registro;
}

/** Compatibilidad con respaldos anteriores a Batch M (sin borrado lógico): `eliminado` por defecto `false`. */
function conEliminadoPorDefecto(fila: FilaConId): FilaConId {
  return { ...fila, eliminado: fila.eliminado ?? false };
}

async function existe(repo: { obtener(id: string): Promise<unknown | null> }, id: string): Promise<boolean> {
  return (await repo.obtener(id)) != null;
}

function itemDe(
  categoria: CategoriaRespaldo,
  fila: FilaConId,
  ctx: {
    nombreIndicador: Map<string, string>;
    nombreLista: Map<string, string>;
    nombreOrigen: Map<string, string>;
    elementosPorLista: Map<string, number>;
  }
): ItemRespaldo {
  const id = idDe(fila);
  switch (categoria) {
    case 'listas': {
      const n = ctx.elementosPorLista.get(id) ?? 0;
      return { id, nombre: String(fila.nombre ?? id), detalle: `${n} elemento${n === 1 ? '' : 's'}` };
    }
    case 'atributos':
      return { id, nombre: String(fila.nombre ?? id), detalle: fila.entidad == null ? undefined : String(fila.entidad) };
    case 'indicadores':
      return { id, nombre: String(fila.nombre ?? id), detalle: fila.codigo ? String(fila.codigo) : undefined };
    case 'reglas':
      return { id, nombre: String(fila.nombre ?? id), detalle: fila.tipo == null ? undefined : String(fila.tipo) };
    case 'metas': {
      const indicadorId = String(fila.indicadorId ?? '');
      return {
        id,
        nombre: ctx.nombreIndicador.get(indicadorId) ?? indicadorId,
        detalle: `${String(fila.claveDesagregacion ?? 'GENERAL')} · ${String(fila.anioVigencia ?? '')}`
      };
    }
    case 'automatizaciones': {
      const indicadorId = String(fila.indicadorId ?? '');
      const origenId = String(fila.origenAutomaticoId ?? '');
      return { id, nombre: ctx.nombreIndicador.get(indicadorId) ?? indicadorId, detalle: ctx.nombreOrigen.get(origenId) ?? origenId };
    }
    case 'aliasDesagregacion': {
      const listaId = String(fila.listaId ?? '');
      const origenId = String(fila.origenAutomaticoId ?? '');
      return {
        id,
        nombre: String(fila.alias ?? id),
        detalle: `${ctx.nombreLista.get(listaId) ?? listaId} ← ${ctx.nombreOrigen.get(origenId) ?? origenId}`
      };
    }
    default:
      return { id, nombre: String(fila.nombre ?? id) };
  }
}
