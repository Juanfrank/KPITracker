import type { RegistroAuditoria } from '@domain/index';
import { equipoEfectivo, puedeVerAuditoriaEquipo, puedeVerAuditoriaTodo } from '@domain/index';
import type { FiltroAuditoria, IAuditoriaRepository, IIndicadorRepository, IResponsableRepository } from '@application/ports/index';
import { permisosActuales } from './contextoUsuario';

/**
 * Consulta de auditoría con el filtrado por permiso de Batch T: con
 * `auditoria.ver.todos` (o admin) se ve todo, sin cambios; con solo
 * `auditoria.ver.equipo` se filtra a los registros de entidad `Indicador` o
 * `Resultado` (`entidadId` = `<indicadorId>` o `<indicadorId>:<periodo>:<clave>`,
 * ver `ServicioRecoleccion`) cuyo equipo efectivo coincide con el del
 * usuario — el resto de las entidades (Categoria, Rol, Usuario...) no tienen
 * un "equipo dueño" con el que filtrar, así que quedan ocultas. Sin ninguno
 * de los dos permisos, la consulta devuelve vacío (misma filosofía que
 * `ServicioSeguimiento.tablero`: nada visible, no un error).
 */
export class ServicioAuditoria {
  constructor(
    private readonly repo: IAuditoriaRepository,
    private readonly indicadores: IIndicadorRepository,
    private readonly responsables: IResponsableRepository
  ) {}

  async consultar(filtro: FiltroAuditoria): Promise<RegistroAuditoria[]> {
    const permisos = permisosActuales();
    if (puedeVerAuditoriaTodo(permisos)) return this.repo.consultar(filtro);
    if (!puedeVerAuditoriaEquipo(permisos, permisos.equipoId)) return [];

    const registros = await this.repo.consultar(filtro);
    const [indicadores, responsables] = await Promise.all([this.indicadores.listar(), this.responsables.listar()]);
    const indicadoresPorId = new Map(indicadores.map((i) => [i.id, i]));
    const responsablesPorId = new Map(responsables.map((r) => [r.id, { equipoId: r.equipoId }]));

    const equipoDeIndicador = (indicadorId: string): string | null => {
      const indicador = indicadoresPorId.get(indicadorId);
      return indicador ? equipoEfectivo(indicador, responsablesPorId) : null;
    };

    return registros.filter((r) => {
      if (r.entidad === 'Indicador') return equipoDeIndicador(r.entidadId) === permisos.equipoId;
      if (r.entidad === 'Resultado') return equipoDeIndicador(r.entidadId.split(':')[0] ?? '') === permisos.equipoId;
      return false;
    });
  }
}
