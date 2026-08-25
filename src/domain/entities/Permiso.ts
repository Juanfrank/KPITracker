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
  { id: 'auditoria.ver.equipo', ambito: 'equipo', etiqueta: 'Ver auditoría del equipo' },

  // --- Batch X (X6/X7): permisos de delegación más finos que catalogos.administrar/esAdministrador ---
  // "Modificar X" (ambito equipo): deshabilitados por defecto en los roles de equipo semilla (Colaborador/
  // Visor/Líder/Validador) — quien los tenga puede administrar ESE catálogo puntual (organización completa,
  // no solo "su" equipo: Atributos/Listas/Reglas son catálogos globales sin noción de equipo propio, así que
  // no hay un subconjunto más chico al que restringir la edición) sin necesitar catalogos.administrar completo.
  { id: 'indicadores.modificar', ambito: 'equipo', etiqueta: 'Modificar indicadores' },
  { id: 'metas.modificar', ambito: 'equipo', etiqueta: 'Modificar metas' },
  { id: 'atributos.modificar', ambito: 'equipo', etiqueta: 'Modificar atributos' },
  { id: 'listas.modificar', ambito: 'equipo', etiqueta: 'Modificar listas' },
  { id: 'reglas.modificar', ambito: 'equipo', etiqueta: 'Modificar reglas' },

  // "Administrar X" (ambito general): delegación puntual de una porción de catalogos.administrar.
  { id: 'respaldo.importarExportar', ambito: 'general', etiqueta: 'Importar/exportar respaldos' },
  { id: 'categorias.administrar', ambito: 'general', etiqueta: 'Administrar categorías' },
  { id: 'equipos.administrar', ambito: 'general', etiqueta: 'Administrar equipos' },
  { id: 'origenes.administrar', ambito: 'general', etiqueta: 'Administrar orígenes automáticos' },
  /**
   * Deliberadamente NO cubierto por `catalogos.administrar` (ver `puedeAdministrarRoles` en
   * `PoliticaPermisos.ts`): administrar roles/permisos es más sensible que administrar catálogos —
   * puede conceder otros permisos — así que exige `esAdministrador` o este permiso puntual, nunca el
   * genérico de catálogos. Puede asignar/desasignar cualquier ROL (general o de equipo) a cualquier
   * usuario, pero nunca el flag `esAdministrador` en sí (eso sigue siendo exclusivo de un administrador,
   * ver `usuariosRouter.establecerAdministrador` en `usuarios.ts`, siempre `adminProcedure`).
   */
  { id: 'roles.administrar', ambito: 'general', etiqueta: 'Administrar roles (asignar/desasignar, salvo Administrador)' }
];

const IDS_VALIDOS = new Set(CATALOGO_PERMISOS.map((p) => p.id));
const AMBITO_POR_ID = new Map(CATALOGO_PERMISOS.map((p) => [p.id, p.ambito] as const));

export function permisoValido(id: string): boolean {
  return IDS_VALIDOS.has(id);
}

export function ambitoDePermiso(id: string): AmbitoPermiso | undefined {
  return AMBITO_POR_ID.get(id);
}

/** Una fila del grid de permisos (Batch U, U3): un concepto, con su permiso general y/o de equipo (uno de los dos puede faltar). */
export interface FilaGridPermisos {
  etiqueta: string;
  general: DefinicionPermiso | null;
  equipo: DefinicionPermiso | null;
}

/**
 * Agrupación fila→{general,equipo} del catálogo, para reemplazar el
 * checklist plano por una tabla de checkboxes (una fila por concepto, una
 * columna por ámbito). El emparejamiento es explícito (no se infiere de los
 * ids/etiquetas, que no siguen un patrón textual uniforme: "resultados.ver.
 * todos"/".equipo" sí, pero "catalogos.administrar" o "equipo.miembros.
 * gestionar" no tienen contraparte del otro ámbito) — agregar un permiso
 * nuevo al catálogo es agregar una fila aquí.
 */
const FILAS_GRID_PERMISOS: ReadonlyArray<{ etiqueta: string; general?: string; equipo?: string }> = [
  { etiqueta: 'Ver indicadores', general: 'indicadores.ver.todos' },
  { etiqueta: 'Ver resultados', general: 'resultados.ver.todos', equipo: 'resultados.ver.equipo' },
  { etiqueta: 'Registrar resultados', general: 'resultados.registrar.todos', equipo: 'resultados.registrar.equipo' },
  { etiqueta: 'Validar resultados', general: 'resultados.validar.todos', equipo: 'resultados.validar.equipo' },
  { etiqueta: 'Ver auditoría', general: 'auditoria.ver.todos', equipo: 'auditoria.ver.equipo' },
  { etiqueta: 'Administrar configuración', general: 'catalogos.administrar' },
  { etiqueta: 'Gestionar miembros del equipo', equipo: 'equipo.miembros.gestionar' },
  { etiqueta: 'Asignar indicadores del equipo', equipo: 'equipo.indicadores.asignar' },
  { etiqueta: 'Modificar indicadores', equipo: 'indicadores.modificar' },
  { etiqueta: 'Modificar metas', equipo: 'metas.modificar' },
  { etiqueta: 'Modificar atributos', equipo: 'atributos.modificar' },
  { etiqueta: 'Modificar listas', equipo: 'listas.modificar' },
  { etiqueta: 'Modificar reglas', equipo: 'reglas.modificar' },
  { etiqueta: 'Importar/exportar respaldos', general: 'respaldo.importarExportar' },
  { etiqueta: 'Administrar categorías', general: 'categorias.administrar' },
  { etiqueta: 'Administrar equipos', general: 'equipos.administrar' },
  { etiqueta: 'Administrar orígenes automáticos', general: 'origenes.administrar' },
  { etiqueta: 'Administrar roles', general: 'roles.administrar' }
];

export function agruparPermisosParaGrid(): FilaGridPermisos[] {
  const porId = new Map(CATALOGO_PERMISOS.map((p) => [p.id, p] as const));
  return FILAS_GRID_PERMISOS.map(({ etiqueta, general, equipo }) => ({
    etiqueta,
    general: general ? porId.get(general) ?? null : null,
    equipo: equipo ? porId.get(equipo) ?? null : null
  }));
}
