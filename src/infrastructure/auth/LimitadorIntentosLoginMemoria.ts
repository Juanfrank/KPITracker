import type { ILimitadorIntentos } from '@application/ports/index';

/** Ventana deslizante: se bloquea mientras haya >= `MAX_INTENTOS` fallos en los últimos `VENTANA_MS`. */
const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;

/**
 * Implementación en memoria de `ILimitadorIntentos` (audit de seguridad,
 * MEDIUM — antes `auth.login` no tenía ningún freno de fuerza bruta). Basta
 * con memoria de proceso: un único espacio de trabajo compartido, un solo
 * proceso Node (ver plan §0) — no hace falta persistirlo en la base de
 * datos ni sobrevivir a un reinicio, igual criterio "rudimentario por
 * ahora" que ya aplica al resto de la autenticación.
 */
export class LimitadorIntentosLoginMemoria implements ILimitadorIntentos {
  private readonly fallosPorClave = new Map<string, number[]>();

  estaBloqueado(clave: string, ahora: Date): boolean {
    return this.fallosVigentes(clave, ahora).length >= MAX_INTENTOS;
  }

  registrarFallo(clave: string, ahora: Date): void {
    const vigentes = this.fallosVigentes(clave, ahora);
    vigentes.push(ahora.getTime());
    this.fallosPorClave.set(clave, vigentes);
  }

  limpiar(clave: string): void {
    this.fallosPorClave.delete(clave);
  }

  /** Poda y devuelve los fallos de `clave` dentro de la ventana — efecto secundario deliberado: mantiene el mapa sin crecer sin límite. */
  private fallosVigentes(clave: string, ahora: Date): number[] {
    const todos = this.fallosPorClave.get(clave) ?? [];
    const vigentes = todos.filter((t) => ahora.getTime() - t < VENTANA_MS);
    this.fallosPorClave.set(clave, vigentes);
    return vigentes;
  }
}
