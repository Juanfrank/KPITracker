import type { ValorAtributo } from '@domain/index';
import type { ValorAtributoEntidad } from '@application/ports/index';

/** Coalesce de las columnas tipadas EAV a un único valor escalar (para el motor de reglas). */
export function escalarDeValorEntidad(v: ValorAtributoEntidad): ValorAtributo {
  if (v.valorTexto != null) return v.valorTexto;
  if (v.valorNumero != null) return v.valorNumero;
  if (v.valorFecha != null) return v.valorFecha;
  if (v.valorBooleano != null) return v.valorBooleano;
  return null;
}

export function mapaValoresDesdeEntidad(valores: ValorAtributoEntidad[]): Map<string, ValorAtributo> {
  const mapa = new Map<string, ValorAtributo>();
  for (const v of valores) mapa.set(v.atributoId, escalarDeValorEntidad(v));
  return mapa;
}
