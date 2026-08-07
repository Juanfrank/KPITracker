import type { ContextoEvaluacion } from '../rules/Condicion';
import { EvaluadorReglas } from '../rules/EvaluadorReglas';
import type { ReglaNegocio } from '../entities/ReglaNegocio';

/** Agregados calculados sobre las filas de un levantamiento (fila General + desagregaciones). */
export interface AgregadosCaptura {
  general: number | null;
  maximo: number | null;
  minimo: number | null;
  suma: number;
  promedio: number | null;
  cantidadConValor: number;
  totalCombinaciones: number;
}

export interface FilaValor {
  esGeneral: boolean;
  /**
   * true solo en las filas de detalle completo (todas las desagregaciones
   * presentes, ninguna enrollada) — a diferencia de las filas de subtotal
   * (nivel intermedio del cubo, ver ProductoCartesiano), que no deben
   * contarse aquí: ya están implícitas en el detalle completo y sumarlas
   * junto a él infla Suma/Máximo/Promedio con el mismo dato varias veces.
   */
  esDetalleCompleto: boolean;
  valor: number | null;
}

export function calcularAgregadosCaptura(filas: FilaValor[]): AgregadosCaptura {
  const general = filas.find((f) => f.esGeneral)?.valor ?? null;
  const desagregados = filas.filter((f) => f.esDetalleCompleto && f.valor != null).map((f) => f.valor as number);
  const suma = desagregados.reduce((a, b) => a + b, 0);
  return {
    general,
    maximo: desagregados.length > 0 ? Math.max(...desagregados) : null,
    minimo: desagregados.length > 0 ? Math.min(...desagregados) : null,
    suma,
    promedio: desagregados.length > 0 ? suma / desagregados.length : null,
    cantidadConValor: filas.filter((f) => f.valor != null).length,
    totalCombinaciones: filas.length
  };
}

function contextoDeAgregados(agregados: AgregadosCaptura): ContextoEvaluacion {
  const mapa: Record<string, number | null> = {
    General: agregados.general,
    Maximo: agregados.maximo,
    Minimo: agregados.minimo,
    Suma: agregados.suma,
    Promedio: agregados.promedio,
    CantidadConValor: agregados.cantidadConValor,
    TotalCombinaciones: agregados.totalCombinaciones
  };
  return { obtenerAtributo: (nombre) => mapa[nombre] ?? null };
}

/**
 * Valida el levantamiento contra reglas `ValidacionCruzada` de entidad
 * `Recoleccion` (el contexto expone General/Maximo/Minimo/Suma/Promedio/
 * CantidadConValor/TotalCombinaciones), más una advertencia integrada por
 * defecto. Son siempre advertencias no bloqueantes: el autoguardado nunca
 * se detiene por ellas.
 */
export function evaluarValidacionesCaptura(
  agregados: AgregadosCaptura,
  reglas: ReglaNegocio[],
  evaluador: EvaluadorReglas = new EvaluadorReglas()
): string[] {
  const advertencias: string[] = [];
  const contexto = contextoDeAgregados(agregados);

  if (agregados.general != null && agregados.maximo != null && agregados.general < agregados.maximo) {
    advertencias.push(
      `El resultado General (${agregados.general}) es menor que el máximo de sus desagregaciones (${agregados.maximo}).`
    );
  }

  for (const regla of reglas) {
    if (!regla.activa || regla.tipo !== 'ValidacionCruzada' || regla.entidad !== 'Recoleccion') continue;
    if (!evaluador.evaluar(regla.condicion, contexto)) {
      advertencias.push(regla.mensajeError ?? `No se cumple la regla "${regla.nombre}".`);
    }
  }

  return advertencias;
}
