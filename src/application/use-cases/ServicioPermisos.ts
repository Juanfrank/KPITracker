import type { ContextoPermisos } from '@domain/index';
import type { IPermisoExcepcionalRepository, IRolRepository, IUsuarioRepository } from '@application/ports/index';

/**
 * Resuelve el `ContextoPermisos` (dominio, `PoliticaPermisos.ts`) de un
 * usuario autenticado: lee su `Usuario` + su rol general + su rol de equipo
 * (si tiene) + sus permisos excepcionales, y arma el objeto puro que
 * `puedeSobreIndicador`/etc. consumen. Es la única pieza de Batch T que toca
 * repositorios para esto — todo lo demás (`trpc.ts`, los servicios que
 * filtran/gatean) solo llama a las funciones puras de dominio con el
 * resultado.
 */
export class ServicioPermisos {
  constructor(
    private readonly usuarios: IUsuarioRepository,
    private readonly roles: IRolRepository,
    private readonly permisosExcepcionales: IPermisoExcepcionalRepository
  ) {}

  async resolver(usuarioId: string): Promise<ContextoPermisos> {
    const usuario = await this.usuarios.obtener(usuarioId);
    if (!usuario) {
      return {
        esAdministrador: false,
        usuarioId: null,
        equipoId: null,
        permisosGenerales: new Set(),
        permisosEquipo: new Set(),
        permisosExcepcionales: new Set()
      };
    }

    const [rolGeneral, rolEquipo, excepcionales] = await Promise.all([
      usuario.rolGeneralId ? this.roles.obtener(usuario.rolGeneralId) : Promise.resolve(null),
      usuario.equipoId && usuario.rolEquipoId ? this.roles.obtener(usuario.rolEquipoId) : Promise.resolve(null),
      this.permisosExcepcionales.listarPorUsuario(usuarioId)
    ]);

    return {
      esAdministrador: usuario.esAdministrador,
      usuarioId: usuario.id,
      equipoId: usuario.equipoId,
      permisosGenerales: new Set(rolGeneral?.ambito === 'general' ? rolGeneral.permisos : []),
      permisosEquipo: new Set(rolEquipo?.ambito === 'equipo' ? rolEquipo.permisos : []),
      permisosExcepcionales: new Set(excepcionales)
    };
  }
}
