import { join } from 'node:path';
import type { Db } from '../duckdb/Db';
import type { RutasDataLake } from '../parquet/RutasDataLake';
import type { ICatalogoRepository, IConfiguracionRepository, IExportService } from '@application/ports/index';
import { GeneradorPeriodos } from '@domain/services/GeneradorPeriodos';
import { EvaluadorFormulas } from '@domain/services/EvaluadorFormulas';
import { Periodicidad } from '@domain/value-objects/Periodicidad';
import { textoAClave } from '@domain/value-objects/ClaveDesagregacion';
import type { Categoria, DefinicionPeriodicidad, Responsable } from '@domain/index';

function sq(v: string): string {
  return v.replace(/'/g, "''");
}
function lit(v: string | number | null): string {
  if (v == null) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return `'${sq(v)}'`;
}

/**
 * Genera la segunda capa de datos orientada al consumo analítico:
 * 1. Dimensiones del star schema (/Data/Dimensions/*.parquet).
 * 2. Tabla completamente desnormalizada ResultadosAnalitico (Parquet y,
 *    opcionalmente, CSV UTF-8) donde cada fila es un resultado levantado con
 *    todos los atributos del indicador, las desagregaciones expandidas como
 *    columnas, fecha de corte, período, año, valor y campos calculados.
 * Se regenera automáticamente (con debounce) tras cada modificación, de modo
 * que el archivo plano esté siempre sincronizado con el modelo interno.
 */
export class ExportAnaliticoService implements IExportService {
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private regenerando: Promise<void> = Promise.resolve();
  private readonly generadorPeriodos = new GeneradorPeriodos();
  private readonly formulas = new EvaluadorFormulas();

  constructor(
    private readonly db: Db,
    private readonly rutas: RutasDataLake,
    private readonly configuracion: IConfiguracionRepository,
    private readonly periodicidades: ICatalogoRepository<DefinicionPeriodicidad>,
    private readonly responsables: ICatalogoRepository<Responsable>,
    private readonly categorias: ICatalogoRepository<Categoria>,
    private readonly debounceMs = 1000
  ) {}

  rutaExportacion(): string {
    return this.rutas.exportacion;
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
      await this.generarDimensiones();
      await this.generarTablaAnalitica();
    });
    await this.regenerando;
  }

  private async generarDimensiones(): Promise<void> {
    const dim = (nombre: string): string => `'${sq(join(this.rutas.dimensions, nombre))}'`;
    const config = await this.configuracion.obtener();
    const anioActual = new Date().getFullYear();

    await this.db.run(
      `COPY (SELECT row_number() OVER (ORDER BY nombre) AS indicador_key, *
             FROM indicadores) TO ${dim('DimIndicador.parquet')} (FORMAT PARQUET)`
    );
    await this.db.run(
      `COPY (SELECT row_number() OVER (ORDER BY nombre) AS lista_key, * FROM listas)
       TO ${dim('DimLista.parquet')} (FORMAT PARQUET)`
    );
    await this.db.run(
      `COPY (SELECT row_number() OVER (ORDER BY lista_id, orden) AS elemento_key, * FROM elementos_lista)
       TO ${dim('DimElementoLista.parquet')} (FORMAT PARQUET)`
    );
    await this.db.run(
      `COPY (SELECT row_number() OVER (ORDER BY entidad, grupo, orden) AS atributo_key, * FROM atributos)
       TO ${dim('DimAtributo.parquet')} (FORMAT PARQUET)`
    );
    await this.db.run(
      `COPY (SELECT DISTINCT clave_desagregacion,
                    CASE WHEN clave_desagregacion = 'GENERAL' THEN 'General' ELSE 'Desagregado' END AS tipo
             FROM resultados) TO ${dim('DimDesagregacion.parquet')} (FORMAT PARQUET)`
    );

    // DimPeriodo: todos los períodos de las periodicidades estándar, más los
    // de cada definición de periodicidad Personalizada efectivamente usada
    // por algún indicador (una definición sin indicadores no aporta filas).
    const idsUsados = await this.db.all<{ periodicidad_personalizada_id: string }>(
      `SELECT DISTINCT periodicidad_personalizada_id FROM indicadores WHERE periodicidad_personalizada_id IS NOT NULL`
    );
    const definiciones = await this.periodicidades.listar();
    const definicionesUsadas = definiciones.filter((d) =>
      idsUsados.some((u) => u.periodicidad_personalizada_id === d.id)
    );

    const filasPeriodo: string[] = [];
    for (let anio = config.anioInicial; anio <= anioActual + 1; anio++) {
      for (const p of Object.values(Periodicidad)) {
        if (p === Periodicidad.Personalizada) continue;
        for (const periodo of this.generadorPeriodos.periodosDelAnio(anio, p)) {
          filasPeriodo.push(
            `(${lit(periodo.id)}, ${lit(periodo.anio)}, ${lit(periodo.periodicidad)}, ${lit(periodo.numero)}, ${lit(periodo.etiqueta)}, ${lit(periodo.fechaInicio)}, ${lit(periodo.fechaFin)})`
          );
        }
      }
      for (const definicion of definicionesUsadas) {
        for (const periodo of this.generadorPeriodos.periodosDelAnio(anio, Periodicidad.Personalizada, definicion)) {
          filasPeriodo.push(
            `(${lit(periodo.id)}, ${lit(periodo.anio)}, ${lit(periodo.periodicidad)}, ${lit(periodo.numero)}, ${lit(periodo.etiqueta)}, ${lit(periodo.fechaInicio)}, ${lit(periodo.fechaFin)})`
          );
        }
      }
    }
    await this.db.run(
      `COPY (SELECT row_number() OVER () AS periodo_key, * FROM (
         SELECT * FROM (VALUES ${filasPeriodo.join(', ')})
         AS t(periodo_id, anio, periodicidad, numero, etiqueta, fecha_inicio, fecha_fin)
       )) TO ${dim('DimPeriodo.parquet')} (FORMAT PARQUET)`
    );

    // DimFecha: calendario continuo del rango configurado.
    await this.db.run(
      `COPY (
         SELECT CAST(d AS DATE) AS fecha,
                year(d) AS anio, month(d) AS mes, day(d) AS dia,
                quarter(d) AS trimestre, isodow(d) AS dia_semana_iso,
                strftime(d, '%Y-%m') AS anio_mes
         FROM generate_series(DATE '${config.anioInicial}-01-01', DATE '${anioActual + 1}-12-31', INTERVAL 1 DAY) AS t(d)
       ) TO ${dim('DimFecha.parquet')} (FORMAT PARQUET)`
    );
  }

  private async generarTablaAnalitica(): Promise<void> {
    const config = await this.configuracion.obtener();

    const listas = await this.db.all<{ id: string; nombre: string }>('SELECT id, nombre FROM listas');
    const nombrePorLista = new Map(listas.map((l) => [l.id, l.nombre]));
    const elementos = await this.db.all<{ lista_id: string; codigo: string; nombre: string }>(
      'SELECT lista_id, codigo, nombre FROM elementos_lista'
    );
    const descripcionElemento = new Map(elementos.map((e) => [`${e.lista_id}|${e.codigo}`, e.nombre]));
    const definicionesPorId = new Map((await this.periodicidades.listar()).map((d) => [d.id, d]));
    const nombreResponsable = new Map((await this.responsables.listar()).map((r) => [r.id, r.nombre]));
    const nombreCategoria = new Map((await this.categorias.listar()).map((c) => [c.id, c.nombre]));

    const filas = await this.db.all<Record<string, unknown>>(
      `SELECT r.id AS resultado_id, r.indicador_id, r.periodo_id, r.anio, r.clave_desagregacion,
              r.valor, r.observacion, r.actualizado_en,
              i.nombre AS indicador, i.definicion, i.periodicidad, i.linea_base, i.meta_global,
              i.estado, i.responsable, i.categoria, i.unidad_medida, i.periodicidad_personalizada_id,
              l.fecha_corte
       FROM resultados r
       JOIN indicadores i ON i.id = r.indicador_id
       LEFT JOIN levantamientos l ON l.indicador_id = r.indicador_id AND l.periodo_id = r.periodo_id
       ORDER BY i.nombre, r.periodo_id, r.clave_desagregacion`
    );

    // Indicadores calculados: no tienen filas propias en `resultados` (su
    // valor nunca se captura manualmente), así que se sintetizan aquí a
    // nivel GENERAL evaluando la fórmula sobre el valor GENERAL de los
    // indicadores referenciados, para cada período en el que al menos uno
    // de ellos tenga datos.
    const indicadoresCalculados = await this.db.all<Record<string, unknown>>(
      `SELECT * FROM indicadores WHERE es_calculado = true AND formula IS NOT NULL AND formula != ''`
    );
    if (indicadoresCalculados.length > 0) {
      const codigoPorId = new Map(
        (await this.db.all<{ id: string; codigo: string }>('SELECT id, codigo FROM indicadores')).map((i) => [i.id, i.codigo])
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
    ];

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

    const valoresFilas: string[] = [];
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

      const celdas = [
        lit(String(f.resultado_id)), lit(String(f.indicador_id)), lit(String(f.indicador)),
        lit(String(f.definicion ?? '')), lit(String(f.periodicidad)), lit(String(f.estado)),
        lit(responsableNombre),
        lit(categoriaNombre),
        lit(f.unidad_medida == null ? null : String(f.unidad_medida)),
        lit(Number(f.anio)), lit(String(f.periodo_id)), lit(periodoEtiqueta(String(f.periodo_id), definicionIndicador)),
        lit(f.fecha_corte == null ? null : String(f.fecha_corte)),
        esGeneral ? 'TRUE' : 'FALSE',
        lit(esGeneral ? 'General' : claveTexto),
        lit(valor), lit(lineaBase), lit(meta), lit(variacion), lit(cumplimiento),
        lit(f.observacion == null ? null : String(f.observacion)),
        lit(String(f.actualizado_en))
      ];
      for (const cd of columnasDesagregacion) {
        const codigo = porLista.get(cd.listaId) ?? null;
        const descripcion = codigo == null ? null : (descripcionElemento.get(`${cd.listaId}|${codigo}`) ?? codigo);
        celdas.push(lit(esGeneral ? 'Total' : descripcion));
      }
      valoresFilas.push(`(${celdas.join(', ')})`);
    }

    const todasColumnas = [...columnasFijas, ...columnasDesagregacion.map((c) => `"${c.columna}"`)];
    const rutaParquet = join(this.rutas.exportacion, 'ResultadosAnalitico.parquet');
    const rutaCsv = join(this.rutas.exportacion, 'ResultadosAnalitico.csv');

    const cuerpo =
      valoresFilas.length === 0
        ? `SELECT ${todasColumnas.map((c) => `NULL AS ${c}`).join(', ')} WHERE 1 = 0`
        : `SELECT * FROM (VALUES ${valoresFilas.join(', ')}) AS t(${todasColumnas.join(', ')})`;

    await this.db.run(`COPY (${cuerpo}) TO '${sq(rutaParquet)}' (FORMAT PARQUET)`);
    if (config.exportarCsv) {
      await this.db.run(`COPY (${cuerpo}) TO '${sq(rutaCsv)}' (FORMAT CSV, HEADER, DELIMITER ',')`);
    }
  }
}
