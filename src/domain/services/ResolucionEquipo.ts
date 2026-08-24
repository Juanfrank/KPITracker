/**
 * Resuelve a qué equipo pertenece (efectivamente) un indicador: el vínculo
 * DIRECTO (`indicador.equipo`) gana si está presente; si no, se deriva
 * INDIRECTAMENTE del equipo del `Usuario` responsable (`indicador.responsable`
 * apunta a `Usuario.id` desde Batch U, que unificó Usuario y el antiguo
 * catálogo Responsable). Sin ninguno de los dos, el indicador no pertenece a
 * ningún equipo.
 */
export function equipoEfectivo(
  indicador: { equipo: string | null; responsable: string | null },
  usuariosPorId: ReadonlyMap<string, { equipoId: string | null }>
): string | null {
  if (indicador.equipo) return indicador.equipo;
  const responsable = indicador.responsable ? usuariosPorId.get(indicador.responsable) : undefined;
  return responsable?.equipoId ?? null;
}
