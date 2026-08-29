import { ID_ROL_ADMINISTRADOR } from '@domain/index';
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
 *
 * Batch Y: el rol general "Administrador" (`ID_ROL_ADMINISTRADOR`) se
 * resuelve como `esAdministrador: true` en el `ContextoPermisos` — hace que
 * TODO chequeo de `PoliticaPermisos` (que siempre empieza por
 * `ctx.esAdministrador ||`) le conceda acceso total, igual que al flag real
 * `Usuario.esAdministrador`. La única diferencia entre ambos caminos es que
 * `adminProcedure` (`trpc.ts`) y las pantallas más sensibles (gestión de
 * Usuarios) siguen mirando el flag CRUDO de la sesión (`ctx.usuario.
 * esAdministrador`), no este `ContextoPermisos` resuelto — ver el docstring
 * de `Usuario`/`Rol`.
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
      esAdministrador: usuario.esAdministrador || rolGeneral?.id === ID_ROL_ADMINISTRADOR,
      usuarioId: usuario.id,
      equipoId: usuario.equipoId,
      permisosGenerales: new Set(rolGeneral?.ambito === 'general' ? rolGeneral.permisos : []),
      permisosEquipo: new Set(rolEquipo?.ambito === 'equipo' ? rolEquipo.permisos : []),
      permisosExcepcionales: new Set(excepcionales)
    };
  }
}
