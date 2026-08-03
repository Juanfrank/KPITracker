import type { MetodoCalculo } from '../entities/Meta';

export type FuncionAgregacion = (valores: number[]) => number | null;

/**
 * Registro de métodos de cálculo de cumplimiento de metas (Strategy).
 * Los métodos agregan los resultados registrados del período de medición.
 */
export class MetodoCalculoRegistry {
  private readonly metodos = new Map<string, FuncionAgregacion>();

  constructor() {
    this.registrar('Promedio', (v) => (v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length));
    this.registrar('Sumatoria', (v) => (v.length === 0 ? null : v.reduce((a, b) => a + b, 0)));
    this.registrar('UltimoValor', (v) => (v.length === 0 ? null : (v[v.length - 1] ?? null)));
    this.registrar('Maximo', (v) => (v.length === 0 ? null : Math.max(...v)));
    this.registrar('Minimo', (v) => (v.length === 0 ? null : Math.min(...v)));
  }

  registrar(nombre: string, fn: FuncionAgregacion): void {
    this.metodos.set(nombre, fn);
  }

  calcular(metodo: MetodoCalculo | string, valores: number[]): number | null {
    const fn = this.metodos.get(metodo);
    if (!fn) throw new Error(`Método de cálculo no registrado: "${metodo}".`);
    return fn(valores);
  }

  listar(): string[] {
    return [...this.metodos.keys()];
  }
}
