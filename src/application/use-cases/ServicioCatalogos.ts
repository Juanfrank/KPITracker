import type {
  AliasDesagregacionOrigen, Atributo, Categoria, ElementoLista, Equipo, Indicador, Lista, Meta, ReglaNegocio,
  TypeRegistry
} from '@domain/index';
import {
  EntidadNoEncontradaError, EvaluadorFormulas, Periodicidad, ValidacionError, ValidadorAtributos,
  cadenaAncestros, construirContextoIndicador, equipoEfectivo, explicarCondicion, puedeAdministrarCatalogos,
  puedeAsignarIndicadoresEquipo, puedeVerIndicador, redondear2, signosAgrupacionBalanceados, sinCiclo,
  tipoAgregacionPadreValido
} from '@domain/index';
import type {
  IAliasDesagregacionOrigenRepository, IAtributoRepository, IAutomatizacionIndicadorRepository, ICatalogoRepository,
  IDefinicionPeriodicidadRepository, IIndicadorRepository, IListaRepository, IMetaRepository,
  IReglaRepository, IUsuarioRepository, ValorAtributoEntidad
} from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';
import { permisosActuales } from './contextoUsuario';
import { mapaValoresDesdeEntidad } from './valoresEav';
import { ServicioCatalogoGenerico } from './ServicioCatalogoGenerico';
import { referenciasDeAtributo, referenciasDeCategoria, referenciasDeEquipo, referenciasDeLista, referenciasDeRegla } from './referencias';

/** Mapeo de campos de Indicador -> nombre de columna del archivo importado (undefined = no mapeado). */
export interface MapeoImportacionIndicadores {
  codigo?: string;
  nombre: string;
  /** Opcional (ver `Indicador.definicion`) — antes era obligatorio en la importación. */
  definicion?: string;
  periodicidad?: string;
  lineaBase?: string;
  metaGlobal?: string;
  unidadMedida?: string;
  /** Nombre de Categoria a asignar, buscado por coincidencia de `nombre` (sin distinguir mayúsculas);
   * sin coincidencia (o sin columna mapeada), el indicador queda sin categoría. */
  categoria?: string;
  /** Equipo de un solo nivel — mismo criterio que `categoria`. Ignorado si se mapea cualquiera de
   * `equipoNivel1`/`equipoNivel2`/`equipoNivel3` (ver esos campos), que tienen prioridad. */
  equipo?: string;
  /**
   * Jerarquía de equipo de hasta 3 niveles (de raíz a hoja — p. ej. Dirección General > Área >
   * Gerencia), pedido explícito del usuario tras notar que el importador solo soportaba un
   * equipo plano. A diferencia de `equipo` (que solo busca, nunca crea), estos 3 niveles buscan
   * O CREAN cada Equipo que falte por `nombre` + padre exacto — así una importación repetida
   * reutiliza la misma cadena en vez de duplicarla. El nivel hoja (el más profundo mapeado) es
   * el que se asigna al indicador; los niveles intermedios existen solo para anidar el árbol de
   * Seguimiento. Nombres consecutivos iguales (insensible a mayúsculas, p. ej. cuando una fila no
   * tiene "Área" propia y repite el nombre de su "Dirección General") se colapsan en un solo nivel
   * en vez de crear un equipo con un hijo homónimo. Basta con mapear 1 de los 3 (nivel único) o
   * los 3 (jerarquía completa); dejar un nivel intermedio sin mapear también es válido, simplemente
   * ese nivel no existe para esa fila.
   */
  equipoNivel1?: string;
  equipoNivel2?: string;
  equipoNivel3?: string;
  /** Atributo dinámico (id) -> columna del archivo — mismo mecanismo de parseo por TypeRegistry que usa el formulario manual. */
  atributos?: Record<string, string>;
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
    private readonly tipos: TypeRegistry,
    private readonly usuariosRepo: IUsuarioRepository,
    /** RBAC granular por categoría (ver docstring de `AmbitoPermiso` en `Permiso.ts`). */
    private readonly categoriasRepo: ICatalogoRepository<Categoria>,
    /** Solo para resolver Categoria/Equipo por nombre en `importarExcel` — ver `MapeoImportacionIndicadores`. */
    private readonly equiposRepo: ICatalogoRepository<Equipo>
  ) {
    super(ctx);
  }

  /** Filtra a los indicadores que el usuario en curso puede ver (Batch T) — ver `puedeVerIndicador`. */
  async listar(): Promise<Indicador[]> {
    const [indicadores, usuarios, categorias] = await Promise.all([
      this.repo.listar(), this.usuariosRepo.listar(), this.categoriasRepo.listar()
    ]);
    const usuariosPorId = new Map(usuarios.map((u) => [u.id, { equipoId: u.equipoId }]));
    const permisos = permisosActuales();
    return indicadores.filter((i) =>
      puedeVerIndicador(permisos, {
        equipoEfectivoId: equipoEfectivo(i, usuariosPorId),
        responsable: i.responsable,
        categoriasEfectivas: i.categoria ? cadenaAncestros(i.categoria, categorias) : []
      })
    );
  }

  obtener(id: string): Promise<Indicador | null> {
    return this.repo.obtener(id);
  }

  async guardar(input: GuardarIndicadorInput): Promise<Indicador> {
    const { valores } = input;
    // Categoría/Equipo son opcionales de verdad (retirado el respaldo automático "General" —
    // pedido explícito del usuario: traía más confusión que beneficio, ver `Indicador.categoria`).
    // Un indicador sin ninguno de los dos queda "sin clasificar", agrupado aparte en Seguimiento
    // (ver `SIN_CATEGORIA_ID`/`SIN_EQUIPO_ID` en SeguimientoPage.tsx) en vez de forzarlo a un
    // catálogo real llamado "General".
    const indicador: Indicador = {
      ...input.indicador,
      // Redondeo matemático real a 2 decimales (pedido explícito del usuario) — la meta
      // global y la línea base son valores de referencia, mismo tratamiento que una Meta.
      metaGlobal: input.indicador.metaGlobal == null ? null : redondear2(input.indicador.metaGlobal),
      lineaBase: input.indicador.lineaBase == null ? null : redondear2(input.indicador.lineaBase),
      // Un indicador padre no tiene desagregaciones propias (agrega siempre el total de cada
      // hijo, ver docstring de `Indicador.tipoAgregacionPadre`) ni hijos duplicados.
      desagregaciones: input.indicador.esPadre ? [] : input.indicador.desagregaciones,
      indicadoresHijoIds: input.indicador.esPadre ? [...new Set(input.indicador.indicadoresHijoIds)] : [],
      // Irrelevante cuando no es padre — se normaliza al default para no persistir ruido.
      usarResultadoPropioEnResumenes: input.indicador.esPadre ? input.indicador.usarResultadoPropioEnResumenes : true
    };
    const errores: string[] = [];
    if (!indicador.nombre.trim()) errores.push('El nombre del indicador es obligatorio.');
    // La definición es opcional (pedido explícito del usuario, backlog de brechas Excel -> KPITracker):
    // antes era obligatoria; muchas fuentes de origen no tienen un texto metodológico separado del nombre.
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
    if (indicador.esPadre) {
      if (indicador.esCalculado) {
        errores.push('Un indicador no puede ser calculado y padre al mismo tiempo.');
      }
      if (!indicador.tipoAgregacionPadre || !tipoAgregacionPadreValido(indicador.tipoAgregacionPadre)) {
        errores.push('Debe seleccionar un tipo de agregación válido para el indicador padre.');
      }
      if (indicador.indicadoresHijoIds.length === 0) {
        errores.push('Un indicador padre requiere al menos un indicador hijo.');
      } else if (indicador.id && indicador.indicadoresHijoIds.includes(indicador.id)) {
        errores.push('Un indicador no puede ser su propio hijo.');
      } else {
        // Padre e hijo deben compartir categoría (o subcategoría — una subcategoría es una
        // Categoria más, así que "misma categoría" ya cubre ambos casos) y equipo EFECTIVO
        // (directo si está seteado, si no indirecto vía el responsable — ver `equipoEfectivo`):
        // pedido explícito del usuario, "prohibido residir en equipos/categorías/subcategorías
        // distintas". Se resuelve una sola vez antes del bucle.
        const usuarios = await this.usuariosRepo.listar();
        const usuariosPorId = new Map(usuarios.map((u) => [u.id, { equipoId: u.equipoId }]));
        const equipoPadre = equipoEfectivo(indicador, usuariosPorId);
        for (const hijoId of indicador.indicadoresHijoIds) {
          const hijo = await this.repo.obtener(hijoId);
          if (!hijo) {
            errores.push(`El indicador hijo con id "${hijoId}" no existe.`);
          } else if (hijo.esPadre) {
            errores.push(`"${hijo.nombre}" ya es un indicador padre; no se admite anidar indicadores padre.`);
          } else if (hijo.esCalculado) {
            errores.push(`"${hijo.nombre}" es un indicador calculado; un indicador padre solo admite hijos con resultados propios.`);
          } else if (
            hijo.periodicidad !== indicador.periodicidad ||
            (indicador.periodicidad === Periodicidad.Personalizada && hijo.periodicidadPersonalizadaId !== indicador.periodicidadPersonalizadaId)
          ) {
            errores.push(`"${hijo.nombre}" debe tener la misma periodicidad que el indicador padre.`);
          } else if (hijo.categoria !== indicador.categoria) {
            errores.push(`"${hijo.nombre}" debe pertenecer a la misma categoría (o subcategoría) que el indicador padre.`);
          } else if (equipoEfectivo(hijo, usuariosPorId) !== equipoPadre) {
            errores.push(`"${hijo.nombre}" debe pertenecer al mismo equipo que el indicador padre.`);
          }
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
   * Reasigna responsable, categoría y/o equipo (Batch R: vínculo directo
   * indicador↔equipo, usado también por el panel de Equipos para vincular/
   * desvincular indicadores) a varios indicadores de una vez (acción masiva
   * desde Seguimiento). `undefined` en un campo significa "no tocar"; `null`
   * significa "quitar la asignación actual".
   */
  async reasignarMasivo(
    indicadorIds: string[],
    cambios: { responsable?: string | null; categoria?: string | null; equipo?: string | null }
  ): Promise<void> {
    if (indicadorIds.length === 0) return;
    const ctxPermisos = permisosActuales();
    const esAdmin = puedeAdministrarCatalogos(ctxPermisos);
    // Sin catalogos.administrar, solo el líder del equipo del propio usuario puede reasignar —
    // y únicamente indicadores YA de su equipo, hacia responsables/equipo de ese mismo equipo
    // (equipo.indicadores.asignar). Evita que la acción masiva se use para tocar otros equipos.
    if (!esAdmin) {
      if (!puedeAsignarIndicadoresEquipo(ctxPermisos, ctxPermisos.equipoId)) {
        throw new ValidacionError('No tiene permiso para asignar indicadores.');
      }
      if (cambios.equipo !== undefined && cambios.equipo !== ctxPermisos.equipoId) {
        throw new ValidacionError('Solo puede asignar indicadores al equipo del que es líder.');
      }
      if (cambios.responsable) {
        const responsableDestino = await this.usuariosRepo.obtener(cambios.responsable);
        if (responsableDestino?.equipoId !== ctxPermisos.equipoId) {
          throw new ValidacionError('Solo puede asignar responsables de su propio equipo.');
        }
      }
    }
    const usuarios = esAdmin ? [] : await this.usuariosRepo.listar();
    const usuariosPorId = new Map(usuarios.map((u) => [u.id, { equipoId: u.equipoId }]));

    const ahora = this.ctx.reloj.ahoraIso();
    for (const id of indicadorIds) {
      const actual = await this.repo.obtener(id);
      if (!actual) continue;
      if (!esAdmin && equipoEfectivo(actual, usuariosPorId) !== ctxPermisos.equipoId) {
        throw new ValidacionError(`No tiene permiso para reasignar el indicador "${actual.nombre}": no pertenece a su equipo.`);
      }
      const actualizado: Indicador = {
        ...actual,
        responsable: cambios.responsable === undefined ? actual.responsable : cambios.responsable,
        categoria: cambios.categoria === undefined ? actual.categoria : cambios.categoria,
        equipo: cambios.equipo === undefined ? actual.equipo : cambios.equipo,
        actualizadoEn: ahora
      };
      await this.repo.guardar(actualizado);
      await this.auditar('Modificar', 'Indicador', id, 'reasignacionMasiva',
        JSON.stringify({ responsable: actual.responsable, categoria: actual.categoria, equipo: actual.equipo }),
        JSON.stringify({ responsable: actualizado.responsable, categoria: actualizado.categoria, equipo: actualizado.equipo }));
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

    // Resueltos una sola vez para toda la importación — buscar Categoria/Equipo por nombre y
    // conocer el tipoDato de cada Atributo dinámico mapeado (pedido explícito del usuario:
    // cerrar la brecha de que el importador no traía clasificación ni atributos).
    const [categorias, equipos, atributosDef] = await Promise.all([
      this.categoriasRepo.listar(), this.equiposRepo.listar(), this.atributosRepo.listar('Indicador')
    ]);
    const atributosPorId = new Map(atributosDef.map((a) => [a.id, a]));
    const buscarPorNombre = <T extends { nombre: string }>(lista: T[], nombre: string): T | undefined =>
      lista.find((x) => x.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());

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
        // Sin coincidencia (o sin columna mapeada) -> null: el indicador queda sin categoría,
        // igual que uno creado manualmente sin clasificar (ver docstring de `mapeo.categoria`).
        const categoriaTexto = mapeo.categoria ? (fila[mapeo.categoria] ?? '').trim() : '';
        const categoriaId = categoriaTexto ? (buscarPorNombre(categorias, categoriaTexto)?.id ?? null) : null;
        // Jerarquía de equipo (prioritaria sobre `equipo` plano si se mapeó algún nivel) — ver
        // docstring de `equipoNivel1/2/3` en `MapeoImportacionIndicadores`.
        const columnasJerarquia = [mapeo.equipoNivel1, mapeo.equipoNivel2, mapeo.equipoNivel3].filter(
          (c): c is string => Boolean(c)
        );
        let equipoId: string | null;
        if (columnasJerarquia.length > 0) {
          const cadena = this.cadenaJerarquiaSinRepetidos(columnasJerarquia.map((c) => (fila[c] ?? '').trim()));
          equipoId = cadena.length > 0 ? await this.resolverOCrearEquipoJerarquia(cadena, equipos) : null;
        } else {
          const equipoTexto = mapeo.equipo ? (fila[mapeo.equipo] ?? '').trim() : '';
          equipoId = equipoTexto ? (buscarPorNombre(equipos, equipoTexto)?.id ?? null) : null;
        }

        if (!nombre) throw new ValidacionError(`Fila ${numeroFila}: falta el nombre.`);

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
          categoria: categoriaId,
          equipo: equipoId,
          unidadMedida: mapeo.unidadMedida ? (fila[mapeo.unidadMedida] ?? '').trim() || null : null,
          esCalculado: false,
          formula: null,
          esPadre: false,
          indicadoresHijoIds: [],
          tipoAgregacionPadre: null,
          usarResultadoPropioEnResumenes: true,
          requiereValidacion: true,
          creadoEn: ahora,
          actualizadoEn: ahora
        };

        // Atributos dinámicos mapeados (id de Atributo -> columna): mismo parseo por TypeRegistry
        // que usa el formulario manual (`construirValorEntidad` en IndicadoresPage), para que un
        // valor de texto crudo del archivo caiga en la columna EAV correcta según el tipo del atributo.
        const valores: ValorAtributoEntidad[] = [];
        for (const [atributoId, columna] of Object.entries(mapeo.atributos ?? {})) {
          const atributo = atributosPorId.get(atributoId);
          const crudo = (fila[columna] ?? '').trim();
          if (!atributo || !crudo) continue;
          const descriptor = this.tipos.obtener(atributo.tipoDato);
          const parseado = descriptor.parse(crudo);
          const valor = parseado.ok ? parseado.valor : null;
          const base: ValorAtributoEntidad = {
            atributoId, entidadTipo: 'Indicador', entidadId: '',
            valorTexto: null, valorNumero: null, valorFecha: null, valorBooleano: null
          };
          switch (descriptor.columnaEav) {
            case 'numero': base.valorNumero = typeof valor === 'number' ? valor : null; break;
            case 'fecha': base.valorFecha = typeof valor === 'string' ? valor : null; break;
            case 'booleano': base.valorBooleano = typeof valor === 'boolean' ? valor : null; break;
            default: base.valorTexto = valor == null ? null : Array.isArray(valor) ? valor.join('; ') : String(valor);
          }
          valores.push(base);
        }

        await this.guardar({ indicador, valores });
        creados++;
      } catch (err) {
        const mensaje = err instanceof ValidacionError ? err.detalles?.[0] ?? err.message : String(err);
        errores.push({ fila: numeroFila, mensaje: mensaje ?? 'Error desconocido.' });
      }
    }

    return { creados, errores };
  }

  /** Colapsa nombres vacíos y repeticiones consecutivas (insensible a mayúsculas) de la cadena de niveles crudos de una fila — ver docstring de `equipoNivel1/2/3`. */
  private cadenaJerarquiaSinRepetidos(nombresCrudos: string[]): string[] {
    const cadena: string[] = [];
    for (const nombre of nombresCrudos) {
      if (!nombre) continue;
      const ultimo = cadena[cadena.length - 1];
      if (ultimo && ultimo.toLowerCase() === nombre.toLowerCase()) continue;
      cadena.push(nombre);
    }
    return cadena;
  }

  /**
   * Busca, de raíz a hoja, cada Equipo de la cadena por `nombre` + padre exacto; crea los que
   * falten (mutando `equipos` in-place para que las filas siguientes de la MISMA importación
   * reutilicen lo recién creado en vez de duplicarlo). Devuelve el id del último nivel (hoja),
   * que es el que se asigna al indicador.
   */
  private async resolverOCrearEquipoJerarquia(cadena: string[], equipos: Equipo[]): Promise<string> {
    let padreId: string | null = null;
    let equipoId = '';
    for (const nombre of cadena) {
      let equipo = equipos.find(
        (e) => e.nombre.trim().toLowerCase() === nombre.toLowerCase() && (e.padreId ?? null) === padreId
      );
      if (!equipo) {
        const ahora = this.ctx.reloj.ahoraIso();
        equipo = {
          id: this.ctx.ids.nuevoId(), nombre, descripcion: '', activo: true, eliminado: false, padreId,
          creadoEn: ahora, actualizadoEn: ahora
        };
        await this.equiposRepo.guardar(equipo);
        equipos.push(equipo);
      }
      padreId = equipo.id;
      equipoId = equipo.id;
    }
    return equipoId;
  }
}

/** Administración de atributos dinámicos y sus valores EAV. */
export class ServicioAtributos extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IAtributoRepository,
    private readonly reglasRepo: IReglaRepository,
    private readonly automatizacionesRepo: IAutomatizacionIndicadorRepository,
    private readonly indicadoresRepo: IIndicadorRepository
  ) {
    super(ctx);
  }

  listar(entidad?: string, incluirEliminados = false): Promise<Atributo[]> {
    return this.repo.listar(entidad, incluirEliminados);
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
    const atributo = await this.repo.obtener(id);
    if (!atributo) throw new EntidadNoEncontradaError('Atributo', id);
    const referencias = await referenciasDeAtributo(
      { reglas: this.reglasRepo, automatizaciones: this.automatizacionesRepo, atributos: this.repo, indicadores: this.indicadoresRepo },
      id
    );
    if (referencias.length > 0) {
      throw new ValidacionError(`No se puede eliminar "${atributo.nombre}": está en uso.`, referencias);
    }
    await this.repo.marcarEliminado(id, true);
    await this.auditar('Eliminar', 'Atributo', id, null, null, atributo.nombre);
  }

  async restaurar(id: string): Promise<void> {
    const atributo = await this.repo.obtener(id);
    if (!atributo) throw new EntidadNoEncontradaError('Atributo', id);
    await this.repo.marcarEliminado(id, false);
    await this.auditar('Restaurar', 'Atributo', id, null, null, atributo.nombre);
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
    private readonly aliasRepo: IAliasDesagregacionOrigenRepository,
    private readonly atributosRepo: IAtributoRepository,
    private readonly indicadoresRepo: IIndicadorRepository,
    private readonly automatizacionesRepo: IAutomatizacionIndicadorRepository
  ) {
    super(ctx);
  }

  listar(incluirEliminados = false): Promise<Lista[]> {
    return this.repo.listar(incluirEliminados);
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
    const lista = await this.repo.obtener(id);
    if (!lista) throw new EntidadNoEncontradaError('Lista', id);
    const referencias = await referenciasDeLista(
      {
        indicadores: this.indicadoresRepo,
        atributos: this.atributosRepo,
        aliasDesagregacionOrigen: this.aliasRepo,
        automatizaciones: this.automatizacionesRepo
      },
      id
    );
    if (referencias.length > 0) {
      throw new ValidacionError(`No se puede eliminar "${lista.nombre}": está en uso.`, referencias);
    }
    await this.repo.marcarEliminado(id, true);
    await this.auditar('Eliminar', 'Lista', id, null, null, lista.nombre);
  }

  async restaurar(id: string): Promise<void> {
    const lista = await this.repo.obtener(id);
    if (!lista) throw new EntidadNoEncontradaError('Lista', id);
    await this.repo.marcarEliminado(id, false);
    await this.auditar('Restaurar', 'Lista', id, null, null, lista.nombre);
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

  /**
   * Todos los alias por origen (una fila por lista) para UN origen — usado
   * por el generador de consultas DAX para resolver, de una sola vez, la
   * referencia `Tabla[Columna]` de cada desagregación del indicador en el
   * origen seleccionado.
   */
  listarAliasPorOrigen(origenAutomaticoId: string): Promise<AliasDesagregacionOrigen[]> {
    return this.aliasRepo.listarPorOrigen(origenAutomaticoId);
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
      // Redondeo matemático real a 2 decimales (pedido explícito del usuario).
      valor: redondear2(meta.valor),
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

  listar(entidad?: string, incluirEliminados = false): Promise<ReglaNegocio[]> {
    return this.repo.listar(entidad, incluirEliminados);
  }

  async guardar(regla: ReglaNegocio): Promise<ReglaNegocio> {
    if (!regla.nombre.trim()) throw new ValidacionError('El nombre de la regla es obligatorio.');
    const anterior = regla.id ? await this.repo.obtener(regla.id) : null;
    const ahora = this.ctx.reloj.ahoraIso();
    const guardada: ReglaNegocio = {
      ...regla,
      id: regla.id || this.ctx.ids.nuevoId(),
      creadoEn: regla.creadoEn || ahora,
      actualizadoEn: ahora
    };
    await this.repo.guardar(guardada);
    // `explicarCondicion` (texto legible, el mismo que ya muestra ReglasPage), no JSON.stringify —
    // Auditoría mostraba el objeto Condicion textualizado en "Valor nuevo" (Batch X, X15).
    await this.auditar(
      anterior ? 'Modificar' : 'Crear', 'ReglaNegocio', guardada.id, 'condicion',
      anterior ? explicarCondicion(anterior.condicion) : null, explicarCondicion(guardada.condicion)
    );
    return guardada;
  }

  async eliminar(id: string): Promise<void> {
    const regla = await this.repo.obtener(id);
    if (!regla) throw new EntidadNoEncontradaError('ReglaNegocio', id);
    const referencias = await referenciasDeRegla();
    if (referencias.length > 0) {
      throw new ValidacionError(`No se puede eliminar "${regla.nombre}": está en uso.`, referencias);
    }
    await this.repo.marcarEliminado(id, true);
    await this.auditar('Eliminar', 'ReglaNegocio', id, null, null, regla.nombre);
  }

  async restaurar(id: string): Promise<void> {
    const regla = await this.repo.obtener(id);
    if (!regla) throw new EntidadNoEncontradaError('ReglaNegocio', id);
    await this.repo.marcarEliminado(id, false);
    await this.auditar('Restaurar', 'ReglaNegocio', id, null, null, regla.nombre);
  }
}

/**
 * Categorías jerárquicas (Batch R): envuelve `ServicioCatalogoGenerico<Categoria>`
 * (nombre, auditoría, borrado lógico) agregando lo que ese genérico no puede
 * conocer: formato/unicidad de `prefijo` (mismo criterio que `Lista.prefijo`
 * — puramente visual, ver `etiquetaConPrefijo`, nunca se guarda en el código
 * del indicador) y validación de jerarquía (`padreId` debe existir y no
 * generar ciclo, vía `sinCiclo`). `eliminar()` además bloquea si la
 * categoría tiene subcategorías, sumado al bloqueo por indicadores que ya
 * hace `referenciasDeCategoria`.
 */
export class ServicioCategorias extends ServicioBase {
  private readonly generico: ServicioCatalogoGenerico<Categoria>;

  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: ICatalogoRepository<Categoria>,
    private readonly indicadoresRepo: IIndicadorRepository
  ) {
    super(ctx);
    this.generico = new ServicioCatalogoGenerico(ctx, repo, 'Categoria', (id) => this.verificarReferencias(id));
  }

  listar(incluirEliminados = false): Promise<Categoria[]> {
    return this.generico.listar(incluirEliminados);
  }

  async guardar(categoria: Categoria): Promise<Categoria> {
    const errores: string[] = [];
    const prefijo = categoria.prefijo?.trim().toUpperCase() || null;
    if (prefijo) {
      if (!/^[A-Z]+$/.test(prefijo)) {
        errores.push('El prefijo debe ser alfabético, en mayúsculas, sin espacios ni caracteres especiales.');
      } else {
        const otras = await this.repo.listar();
        if (otras.some((c) => c.id !== categoria.id && c.prefijo?.toUpperCase() === prefijo)) {
          errores.push(`Ya existe una categoría con el prefijo "${prefijo}".`);
        }
      }
    }
    if (categoria.padreId) {
      const todas = await this.repo.listar();
      if (!todas.some((c) => c.id === categoria.padreId)) {
        errores.push('La categoría padre seleccionada no existe.');
      } else if (!sinCiclo(categoria.id, categoria.padreId, todas)) {
        errores.push('La categoría padre seleccionada genera un ciclo (no puede ser subcategoría de sí misma ni de sus propias subcategorías).');
      }
    }
    if (errores.length > 0) throw new ValidacionError('Categoría inválida.', errores);
    return this.generico.guardar({ ...categoria, prefijo });
  }

  eliminar(id: string): Promise<void> {
    return this.generico.eliminar(id);
  }

  restaurar(id: string): Promise<void> {
    return this.generico.restaurar(id);
  }

  private async verificarReferencias(id: string): Promise<string[]> {
    const detalles = await referenciasDeCategoria({ indicadores: this.indicadoresRepo }, id);
    const todas = await this.repo.listar();
    const hijas = todas.filter((c) => c.padreId === id);
    if (hijas.length > 0) detalles.push(`Subcategorías (${hijas.length})`);
    return detalles;
  }
}

/**
 * Equipos jerárquicos (Batch R): mismo patrón que `ServicioCategorias` —
 * envuelve `ServicioCatalogoGenerico<Equipo>` y valida jerarquía (`padreId`
 * existente + `sinCiclo`). `eliminar()` bloquea si tiene sub-equipos, o si
 * algún usuario/indicador lo referencia (`referenciasDeEquipo`: directo
 * vía `Indicador.equipo`, indirecto vía `Usuario.equipoId`).
 */
export class ServicioEquipos extends ServicioBase {
  private readonly generico: ServicioCatalogoGenerico<Equipo>;

  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: ICatalogoRepository<Equipo>,
    private readonly usuariosRepo: IUsuarioRepository,
    private readonly indicadoresRepo: IIndicadorRepository
  ) {
    super(ctx);
    this.generico = new ServicioCatalogoGenerico(ctx, repo, 'Equipo', (id) => this.verificarReferencias(id));
  }

  listar(incluirEliminados = false): Promise<Equipo[]> {
    return this.generico.listar(incluirEliminados);
  }

  async guardar(equipo: Equipo): Promise<Equipo> {
    const errores: string[] = [];
    if (equipo.padreId) {
      const todos = await this.repo.listar();
      if (!todos.some((e) => e.id === equipo.padreId)) {
        errores.push('El equipo padre seleccionado no existe.');
      } else if (!sinCiclo(equipo.id, equipo.padreId, todos)) {
        errores.push('El equipo padre seleccionado genera un ciclo (no puede ser sub-equipo de sí mismo ni de sus propios sub-equipos).');
      }
    }
    if (errores.length > 0) throw new ValidacionError('Equipo inválido.', errores);
    return this.generico.guardar(equipo);
  }

  eliminar(id: string): Promise<void> {
    return this.generico.eliminar(id);
  }

  restaurar(id: string): Promise<void> {
    return this.generico.restaurar(id);
  }

  private async verificarReferencias(id: string): Promise<string[]> {
    const detalles = await referenciasDeEquipo(
      { usuarios: this.usuariosRepo, indicadores: this.indicadoresRepo }, id
    );
    const todos = await this.repo.listar();
    const hijos = todos.filter((e) => e.padreId === id);
    if (hijos.length > 0) detalles.push(`Sub-equipos (${hijos.length})`);
    return detalles;
  }
}
