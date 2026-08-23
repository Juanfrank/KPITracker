/**
 * Catálogo fijo de permisos (Batch T) — el "menú" del que los `Rol`
 * (configurables por el administrador) eligen. No es editable por UI: es
 * código, igual que los tipos de dato o las reglas de fecha límite ya
 * existentes (`builtinTypes.ts`/`reglasBase.ts`) son un registro fijo del que
 * otras entidades configurables (Atributo, Indicador) seleccionan.
 *
 * `ambito` determina dónde aplica un permiso: `'general'` no depende de
 * ningún equipo (p. ej. "ver todos los indicadores"); `'equipo'` solo aplica
 * dentro del equipo del usuario que lo tiene (p. ej. "registrar resultados
 * del equipo"). Un `Rol` solo puede listar permisos de su propio ámbito —
 * ver `ServicioRoles.guardar`.
 */
export type AmbitoPermiso = 'general' | 'equipo';

export interface DefinicionPermiso {
  readonly id: string;
  readonly etiqueta: string;
  readonly ambito: AmbitoPermiso;
}

export const CATALOGO_PERMISOS: readonly DefinicionPermiso[] = [
  { id: 'indicadores.ver.todos', ambito: 'general', etiqueta: 'Ver todos los indicadores' },
  { id: 'resultados.ver.todos', ambito: 'general', etiqueta: 'Ver resultados de cualquier indicador' },
  { id: 'resultados.registrar.todos', ambito: 'general', etiqueta: 'Registrar resultados de cualquier indicador' },
  { id: 'resultados.validar.todos', ambito: 'general', etiqueta: 'Validar resultados de cualquier indicador' },
  { id: 'auditoria.ver.todos', ambito: 'general', etiqueta: 'Ver auditoría completa' },
  {
    id: 'catalogos.administrar',
    ambito: 'general',
    etiqueta: 'Administrar configuración (indicadores, categorías, equipos, listas, atributos, reglas...)'
  },
  { id: 'resultados.ver.equipo', ambito: 'equipo', etiqueta: 'Ver resultados de indicadores del equipo' },
  { id: 'resultados.registrar.equipo', ambito: 'equipo', etiqueta: 'Registrar resultados de indicadores del equipo' },
  { id: 'resultados.validar.equipo', ambito: 'equipo', etiqueta: 'Validar resultados de indicadores del equipo' },
  { id: 'equipo.miembros.gestionar', ambito: 'equipo', etiqueta: 'Añadir/eliminar miembros del equipo' },
  { id: 'equipo.indicadores.asignar', ambito: 'equipo', etiqueta: 'Asignar indicadores a miembros del equipo como responsable' },
  { id: 'auditoria.ver.equipo', ambito: 'equipo', etiqueta: 'Ver auditoría del equipo' }
];

const IDS_VALIDOS = new Set(CATALOGO_PERMISOS.map((p) => p.id));
const AMBITO_POR_ID = new Map(CATALOGO_PERMISOS.map((p) => [p.id, p.ambito] as const));

export function permisoValido(id: string): boolean {
  return IDS_VALIDOS.has(id);
}

export function ambitoDePermiso(id: string): AmbitoPermiso | undefined {
  return AMBITO_POR_ID.get(id);
}
