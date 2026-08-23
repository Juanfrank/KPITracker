/**
 * Resuelve a qué equipo pertenece (efectivamente) un indicador: el vínculo
 * DIRECTO (`indicador.equipo`) gana si está presente; si no, se deriva
 * INDIRECTAMENTE del equipo de su responsable (`responsable.equipoId`).
 * Sin ninguno de los dos, el indicador no pertenece a ningún equipo.
 */
export function equipoEfectivo(
  indicador: { equipo: string | null; responsable: string | null },
  responsablesPorId: ReadonlyMap<string, { equipoId: string | null }>
): string | null {
  if (indicador.equipo) return indicador.equipo;
  const responsable = indicador.responsable ? responsablesPorId.get(indicador.responsable) : undefined;
  return responsable?.equipoId ?? null;
}
