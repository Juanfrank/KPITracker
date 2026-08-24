import { join } from 'node:path';
import type { Knex } from 'knex';
import type { RutasDataLake } from '../parquet/RutasDataLake';
import type { ICatalogoRepository, IConfiguracionRepository, IExportService, IUsuarioRepository } from '@application/ports/index';
import { GeneradorPeriodos } from '@domain/services/GeneradorPeriodos';
import { EvaluadorFormulas } from '@domain/services/EvaluadorFormulas';
import { Periodicidad } from '@domain/value-objects/Periodicidad';
import { textoAClave } from '@domain/value-objects/ClaveDesagregacion';
import type { Categoria, DefinicionPeriodicidad } from '@domain/index';
import { DuckDbAnalitico, escribirCsv, escribirParquet } from './DuckDbAnalitico';

// Listas explícitas de columnas (en vez de inferirlas de la primera fila)
// para que las dimensiones se generen con el esquema correcto incluso
// cuando la tabla de origen está vacía — reflejan 1:1 las columnas creadas
// por la migración inicial de Knex (ver src/infrastructure/db/migrations).
const COLUMNAS_INDICADOR = [
  'id', 'codigo', 'nombre', 'definicion', 'forma_calculo', 'periodicidad', 'linea_base',
  'linea_base_periodo_id', 'meta_global', 'desagregaciones', 'estado', 'responsable', 'categoria',
  'unidad_medida', 'periodicidad_personalizada_id', 'es_calculado', 'formula', 'origen_automatico_id',
  'parametros_origen', 'creado_en', 'actualizado_en'
] as const;
const COLUMNAS_LISTA = [
  'id', 'nombre', 'descripcion', 'prefijo', 'estado', 'version', 'orden', 'jerarquica', 'eliminado',
  'creado_en', 'actualizado_en'
] as const;
const COLUMNAS_ELEMENTO_LISTA = ['id', 'lista_id', 'codigo', 'nombre', 'descripcion', 'orden', 'padre_codigo', 'activo'] as const;
const COLUMNAS_ATRIBUTO = [
  'id', 'entidad', 'nombre', 'descripcion', 'grupo', 'orden', 'visible', 'editable', 'obligatorio',
  'valor_por_defecto', 'tipo_dato', 'lista_id', 'validaciones', 'condicion_visibilidad',
  'condicion_obligatorio', 'filtrable', 'activo', 'eliminado', 'creado_en', 'actualizado_en'
] as const;

/**
 * Genera la capa de datos orientada al consumo analítico (Power BI):
 * 1. Dimensiones del star schema (/Data/Dimensions/*.parquet).
 * 2. Tabla completamente desnormalizada ResultadosAnalitico (Parquet y,
 *    opcionalmente, CSV UTF-8) donde cada fila es un resultado levantado con
 *    todos los atributos del indicador, las desagregaciones expandidas como
 *    columnas, fecha de corte, período, año, valor y campos calculados.
 *
 * Se regenera automáticamente (con debounce) tras cada modificación, de modo
 * que el archivo plano esté siempre sincronizado con el modelo interno.
 *
 * Reimplementación de la Fase 5 (plan de migración a app web, §6): la
 * persistencia OLTP vive en Knex (SQLite local o SQL Server); DuckDB queda
 * acotado exclusivamente al rol de motor de escritura Parquet/CSV, en una
 * instancia de trabajo en memoria (`DuckDbAnalitico`) creada y destruida en
 * cada `regenerar()` — no vuelve a ser un almacén persistente.
 */
export class ExportAnaliticoService implements IExportService {
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private regenerando: Promise<void> = Promise.resolve();
  private readonly generadorPeriodos = new GeneradorPeriodos();
  private readonly formulas = new EvaluadorFormulas();

  constructor(
    private readonly knex: Knex,
    private readonly rutas: RutasDataLake,
    private readonly configuracion: IConfiguracionRepository,
    private readonly periodicidades: ICatalogoRepository<DefinicionPeriodicidad>,
    private readonly usuarios: IUsuarioRepository,
    private readonly categorias: ICatalogoRepository<Categoria>,
    private readonly debounceMs = 1000
  ) {}

  rutaExportacion(): string {
    return this.rutas.exportacion;
  }

  cancelar(): void {
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
  }

  solicitarRegeneracion(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      void this.regenerar().catch((e) => console.error('Error regenerando exportación analítica:', e));
    }, this.debounceMs);
  }

  async regenerar(): Promise<void> {
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    this.regenerando = this.regenerando.then(async () => {
      const db = await DuckDbAnalitico.crear();
      try {
        await this.generarDimensiones(db);
        await this.generarTablaAnalitica(db);
      } finally {
        db.cerrar();
      }
    });
    await this.regenerando;
  }

  private async generarDimensiones(db: DuckDbAnalitico): Promise<void> {
    const dim = (nombre: string): string => join(this.rutas.dimensions, nombre);
    const config = await this.configuracion.obtener();
    const anioActual = new Date().getFullYear();

    const indicadores = await this.knex('indicadores').select(COLUMNAS_INDICADOR as unknown as string[]).orderBy('nombre');
    await escribirParquet(
      db,
      indicadores.map((f, i) => ({ indicador_key: i + 1, ...f })),
      ['indicador_key', ...COLUMNAS_INDICADOR],
      dim('DimIndicador.parquet')
    );

    const listas = await this.knex('listas').select(COLUMNAS_LISTA as unknown as string[]).orderBy('nombre');
    await escribirParquet(
      db,
      listas.map((f, i) => ({ lista_key: i + 1, ...f })),
      ['lista_key', ...COLUMNAS_LISTA],
      dim('DimLista.parquet')
    );

    const elementos = await this.knex('elementos_lista')
      .select(COLUMNAS_ELEMENTO_LISTA as unknown as string[])
      .orderBy(['lista_id', 'orden']);
    await escribirParquet(
      db,
      elementos.map((f, i) => ({ elemento_key: i + 1, ...f })),
      ['elemento_key', ...COLUMNAS_ELEMENTO_LISTA],
      dim('DimElementoLista.parquet')
    );

    const atributos = await this.knex('atributos').select(COLUMNAS_ATRIBUTO as unknown as string[]).orderBy(['entidad', 'grupo', 'orden']);
    await escribirParquet(
      db,
      atributos.map((f, i) => ({ atributo_key: i + 1, ...f })),
      ['atributo_key', ...COLUMNAS_ATRIBUTO],
      dim('DimAtributo.parquet')
    );

    const clavesDesagregacion = await this.knex('resultados').distinct('clave_desagregacion');
    await escribirParquet(
      db,
      clavesDesagregacion.map((f: { clave_desagregacion: string }) => ({
        clave_desagregacion: f.clave_desagregacion,
        tipo: f.clave_desagregacion === 'GENERAL' ? 'General' : 'Desagregado'
      })),
      ['clave_desagregacion', 'tipo'],
      dim('DimDesagregacion.parquet')
    );

    // DimPeriodo: todos los períodos de las periodicidades estándar, más los
    // de cada definición de periodicidad Personalizada efectivamente usada
    // por algún indicador (una definición sin indicadores no aporta filas).
    const idsUsados = await this.knex('indicadores')
      .distinct('periodicidad_personalizada_id')
      .whereNotNull('periodicidad_personalizada_id');
    const definiciones = await this.periodicidades.listar();
    const definicionesUsadas = definiciones.filter((d) =>
      idsUsados.some((u: { periodicidad_personalizada_id: string }) => u.periodicidad_personalizada_id === d.id)
    );

    const filasPeriodo: Array<Record<string, unknown>> = [];
    for (let anio = config.anioInicial; anio <= anioActual + 1; anio++) {
      for (const p of Object.values(Periodicidad)) {
        if (p === Periodicidad.Personalizada) continue;
        for (const periodo of this.generadorPeriodos.periodosDelAnio(anio, p)) {
          filasPeriodo.push({
            periodo_id: periodo.id, anio: periodo.anio, periodicidad: periodo.periodicidad,
            numero: periodo.numero, etiqueta: periodo.etiqueta, fecha_inicio: periodo.fechaInicio, fecha_fin: periodo.fechaFin
          });
        }
      }
      for (const definicion of definicionesUsadas) {
        for (const periodo of this.generadorPeriodos.periodosDelAnio(anio, Periodicidad.Personalizada, definicion)) {
          filasPeriodo.push({
            periodo_id: periodo.id, anio: periodo.anio, periodicidad: periodo.periodicidad,
            numero: periodo.numero, etiqueta: periodo.etiqueta, fecha_inicio: periodo.fechaInicio, fecha_fin: periodo.fechaFin
          });
        }
      }
    }
    const columnasPeriodo = ['periodo_key', 'periodo_id', 'anio', 'periodicidad', 'numero', 'etiqueta', 'fecha_inicio', 'fecha_fin'];
    await escribirParquet(
      db,
      filasPeriodo.map((f, i) => ({ periodo_key: i + 1, ...f })),
      columnasPeriodo,
      dim('DimPeriodo.parquet')
    );

    // DimFecha: calendario continuo del rango configurado. Es cálculo puro de
    // fechas, sin dependencia de datos persistidos — se sigue generando con
    // las funciones de fecha de DuckDB (igual que antes de la Fase 2),
    // simplemente ya no comparte instancia con ningún almacén OLTP.
    await db.run(
      `COPY (
         SELECT CAST(d AS DATE) AS fecha,
                year(d) AS anio, month(d) AS mes, day(d) AS dia,
                quarter(d) AS trimestre, isodow(d) AS dia_semana_iso,
                strftime(d, '%Y-%m') AS anio_mes
         FROM generate_series(DATE '${config.anioInicial}-01-01', DATE '${anioActual + 1}-12-31', INTERVAL 1 DAY) AS t(d)
       ) TO '${dim('DimFecha.parquet').replace(/'/g, "''")}' (FORMAT PARQUET)`
    );
  }

  private async generarTablaAnalitica(db: DuckDbAnalitico): Promise<void> {
    const config = await this.configuracion.obtener();

    const listas = await this.knex('listas').select<{ id: string; nombre: string }[]>('id', 'nombre');
    const nombrePorLista = new Map(listas.map((l) => [l.id, l.nombre]));
    const elementos = await this.knex('elementos_lista').select<{ lista_id: string; codigo: string; nombre: string }[]>(
      'lista_id', 'codigo', 'nombre'
    );
    const descripcionElemento = new Map(elementos.map((e) => [`${e.lista_id}|${e.codigo}`, e.nombre]));
    const definicionesPorId = new Map((await this.periodicidades.listar()).map((d) => [d.id, d]));
    const nombreResponsable = new Map((await this.usuarios.listar()).map((u) => [u.id, u.nombreCompleto]));
    const nombreCategoria = new Map((await this.categorias.listar()).map((c) => [c.id, c.nombre]));

    const filas = await this.knex('resultados as r')
      .join('indicadores as i', 'i.id', 'r.indicador_id')
      .leftJoin('levantamientos as l', function joinLevantamiento() {
        this.on('l.indicador_id', '=', 'r.indicador_id').andOn('l.periodo_id', '=', 'r.periodo_id');
      })
      .select<Array<Record<string, unknown>>>(
        'r.id as resultado_id', 'r.indicador_id', 'r.periodo_id', 'r.anio', 'r.clave_desagregacion',
        'r.valor', 'r.observacion', 'r.actualizado_en',
        'i.nombre as indicador', 'i.definicion', 'i.periodicidad', 'i.linea_base', 'i.meta_global',
        'i.estado', 'i.responsable', 'i.categoria', 'i.unidad_medida', 'i.periodicidad_personalizada_id',
        'l.fecha_corte'
      )
      .orderBy([{ column: 'i.nombre' }, { column: 'r.periodo_id' }, { column: 'r.clave_desagregacion' }]);

    // Indicadores calculados: no tienen filas propias en `resultados` (su
    // valor nunca se captura manualmente), así que se sintetizan aquí a
    // nivel GENERAL evaluando la fórmula sobre el valor GENERAL de los
    // indicadores referenciados, para cada período en el que al menos uno
    // de ellos tenga datos.
    const indicadoresCalculados = await this.knex('indicadores')
      .where('es_calculado', true)
      .whereNotNull('formula')
      .whereNot('formula', '');
    if (indicadoresCalculados.length > 0) {
      const codigoPorId = new Map(
        (await this.knex('indicadores').select<{ id: string; codigo: string }[]>('id', 'codigo')).map((i) => [i.id, i.codigo])
      );
      const valorPorCodigoYPeriodo = new Map<string, number | null>();
      for (const f of filas) {
        if (String(f.clave_desagregacion) !== 'GENERAL') continue;
        const codigo = codigoPorId.get(String(f.indicador_id));
        if (!codigo) continue;
        valorPorCodigoYPeriodo.set(`${codigo}|${f.periodo_id}`, f.valor == null ? null : Number(f.valor));
      }

      for (const ic of indicadoresCalculados) {
        const formula = String(ic.formula);
        let codigosRef: string[];
        try {
          codigosRef = this.formulas.codigosReferenciados(formula);
        } catch {
          continue;
        }
        const periodosConDatos = new Set<string>();
        for (const [clave] of valorPorCodigoYPeriodo) {
          const separador = clave.indexOf('|');
          const codigo = clave.slice(0, separador);
          const periodoId = clave.slice(separador + 1);
          if (codigosRef.includes(codigo)) periodosConDatos.add(periodoId);
        }
        for (const periodoId of periodosConDatos) {
          const valores = new Map<string, number | null>(
            codigosRef.map((c) => [c, valorPorCodigoYPeriodo.get(`${c}|${periodoId}`) ?? null])
          );
          let valorCalculado: number | null;
          try {
            valorCalculado = this.formulas.evaluar(formula, valores);
          } catch {
            valorCalculado = null;
          }
          filas.push({
            resultado_id: `calc:${ic.id}:${periodoId}`,
            indicador_id: ic.id,
            periodo_id: periodoId,
            anio: Number(String(periodoId).slice(0, 4)),
            clave_desagregacion: 'GENERAL',
            valor: valorCalculado,
            observacion: null,
            actualizado_en: ic.actualizado_en,
            indicador: ic.nombre,
            definicion: ic.definicion,
            periodicidad: ic.periodicidad,
            linea_base: ic.linea_base,
            meta_global: ic.meta_global,
            estado: ic.estado,
            responsable: ic.responsable,
            categoria: ic.categoria,
            unidad_medida: ic.unidad_medida,
            periodicidad_personalizada_id: ic.periodicidad_personalizada_id,
            fecha_corte: null
          });
        }
      }
    }

    // Columnas de desagregación presentes en los datos, expandidas por lista.
    const listasUsadas = new Set<string>();
    for (const f of filas) {
      const clave = textoAClave(String(f.clave_desagregacion));
      for (const [listaId] of clave.pares) listasUsadas.add(listaId);
    }
    const columnasDesagregacion = [...listasUsadas].sort().map((listaId) => ({
      listaId,
      columna: (nombrePorLista.get(listaId) ?? listaId).replace(/[^\p{L}\p{N}_ ]/gu, '').trim() || listaId
    }));

    const columnasFijas = [
      'resultado_id', 'indicador_id', 'indicador', 'definicion', 'periodicidad', 'estado',
      'responsable', 'categoria', 'unidad_medida', 'anio', 'periodo_id', 'periodo',
      'fecha_corte', 'es_general', 'desagregacion', 'valor', 'linea_base', 'meta',
      'variacion_linea_base', 'cumplimiento_meta_pct', 'observacion', 'actualizado_en'
    ] as const;

    const periodoEtiqueta = (periodoId: string, definicion?: DefinicionPeriodicidad): string => {
      const partes = periodoId.split('-');
      const anio = Number(partes[0]);
      const periodicidad = partes[1] as Periodicidad;
      const numero = Number(partes[2]);
      try {
        return this.generadorPeriodos.periodosDelAnio(anio, periodicidad, definicion)[numero - 1]?.etiqueta ?? periodoId;
      } catch {
        return periodoId;
      }
    };

    const filasSalida: Array<Record<string, unknown>> = [];
    for (const f of filas) {
      const claveTexto = String(f.clave_desagregacion);
      const clave = textoAClave(claveTexto);
      const esGeneral = clave.pares.length === 0;
      const porLista = new Map(clave.pares);
      const valor = f.valor == null ? null : Number(f.valor);
      const lineaBase = f.linea_base == null ? null : Number(f.linea_base);
      const meta = f.meta_global == null ? null : Number(f.meta_global);
      const variacion = valor != null && lineaBase != null ? valor - lineaBase : null;
      const cumplimiento = valor != null && meta != null && meta !== 0 ? (valor / meta) * 100 : null;
      const definicionIndicador = f.periodicidad_personalizada_id == null
        ? undefined
        : definicionesPorId.get(String(f.periodicidad_personalizada_id));
      const responsableNombre = f.responsable == null ? null : (nombreResponsable.get(String(f.responsable)) ?? String(f.responsable));
      const categoriaNombre = f.categoria == null ? null : (nombreCategoria.get(String(f.categoria)) ?? String(f.categoria));

      const fila: Record<string, unknown> = {
        resultado_id: String(f.resultado_id), indicador_id: String(f.indicador_id), indicador: String(f.indicador),
        definicion: String(f.definicion ?? ''), periodicidad: String(f.periodicidad), estado: String(f.estado),
        responsable: responsableNombre,
        categoria: categoriaNombre,
        unidad_medida: f.unidad_medida == null ? null : String(f.unidad_medida),
        anio: Number(f.anio), periodo_id: String(f.periodo_id), periodo: periodoEtiqueta(String(f.periodo_id), definicionIndicador),
        fecha_corte: f.fecha_corte == null ? null : String(f.fecha_corte),
        es_general: esGeneral,
        desagregacion: esGeneral ? 'General' : claveTexto,
        valor, linea_base: lineaBase, meta, variacion_linea_base: variacion, cumplimiento_meta_pct: cumplimiento,
        observacion: f.observacion == null ? null : String(f.observacion),
        actualizado_en: String(f.actualizado_en)
      };
      for (const cd of columnasDesagregacion) {
        const codigo = porLista.get(cd.listaId) ?? null;
        const descripcion = codigo == null ? null : (descripcionElemento.get(`${cd.listaId}|${codigo}`) ?? codigo);
        fila[cd.columna] = esGeneral ? 'Total' : descripcion;
      }
      filasSalida.push(fila);
    }

    const todasColumnas = [...columnasFijas, ...columnasDesagregacion.map((c) => c.columna)];
    const rutaParquet = join(this.rutas.exportacion, 'ResultadosAnalitico.parquet');
    const rutaCsv = join(this.rutas.exportacion, 'ResultadosAnalitico.csv');

    await escribirParquet(db, filasSalida, todasColumnas, rutaParquet);
    if (config.exportarCsv) {
      await escribirCsv(db, filasSalida, todasColumnas, rutaCsv);
    }
  }
}
