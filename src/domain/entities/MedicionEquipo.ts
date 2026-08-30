import type { TratamientoIndicadorMedicion } from './MedicionCategoria';
import type { TipoAgregacion } from '../services/AgregacionMedicion';

/**
 * Configuración de "¿cómo se calcula el resultado del período para el
 * conjunto de indicadores de este equipo?" — mismo shape y semántica que
 * `ConfiguracionMedicionCategoria` (pedido explícito del usuario: "la misma
 * configuración de resumen" en categorías y equipos), 1:1 con un `Equipo`
 * (incluido un sub-equipo: es un equipo más, con su propia configuración
 * independiente). Antes de esta configuración, un equipo/sub-equipo SIEMPRE
 * usaba promedio simple sin excepciones (ver `AT4` en
 * `medicionToggles.spec.ts`) — ahora es configurable igual que una
 * categoría, sin "herencia" automática de la regla del padre.
 */
export interface ConfiguracionMedicionEquipo {
  readonly equipoId: string;
  reglaGeneral: TipoAgregacion;
  tratamientoIndicadores: Record<string, TratamientoIndicadorMedicion>;
  /** Ver docstring de `ConfiguracionMedicionCategoria.acotarAl100` — misma semántica. */
  acotarAl100: boolean;
  actualizadoEn: string;
}
