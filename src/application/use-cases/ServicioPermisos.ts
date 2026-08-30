import { ID_ROL_ADMINISTRADOR } from '@domain/index';
import type { ContextoPermisos } from '@domain/index';
import type {
  IPermisoCategoriaRepository, IPermisoExcepcionalRepository, IRolGlobalRepository, IRolRepository, IUsuarioRepository
} from '@application/ports/index';

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
    private readonly permisosExcepcionales: IPermisoExcepcionalRepository,
    /** Batch AX (fundación SaaS): resuelve `Usuario.rolGlobalId` → `ContextoPermisos.permisosGlobales`. */
    private readonly rolesGlobales: IRolGlobalRepository,
    /** RBAC granular por categoría (ver docstring de `AmbitoPermiso` en `Permiso.ts`). */
    private readonly permisosCategoria: IPermisoCategoriaRepository
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
        permisosExcepcionales: new Set(),
        permisosGlobales: new Set(),
        permisosPorCategoria: new Map()
      };
    }

    const [rolGeneral, rolEquipo, excepcionales, rolGlobal, porCategoria] = await Promise.all([
      usuario.rolGeneralId ? this.roles.obtener(usuario.rolGeneralId) : Promise.resolve(null),
      usuario.equipoId && usuario.rolEquipoId ? this.roles.obtener(usuario.rolEquipoId) : Promise.resolve(null),
      this.permisosExcepcionales.listarPorUsuario(usuarioId),
      usuario.rolGlobalId ? this.rolesGlobales.obtener(usuario.rolGlobalId) : Promise.resolve(null),
      this.permisosCategoria.listarPorUsuario(usuarioId)
    ]);

    const permisosPorCategoria = new Map<string, Set<string>>();
    for (const p of porCategoria) {
      const conjunto = permisosPorCategoria.get(p.categoriaId) ?? new Set<string>();
      conjunto.add(p.permiso);
      permisosPorCategoria.set(p.categoriaId, conjunto);
    }

    return {
      esAdministrador: usuario.esAdministrador || rolGeneral?.id === ID_ROL_ADMINISTRADOR,
      usuarioId: usuario.id,
      equipoId: usuario.equipoId,
      permisosGenerales: new Set(rolGeneral?.ambito === 'general' ? rolGeneral.permisos : []),
      permisosEquipo: new Set(rolEquipo?.ambito === 'equipo' ? rolEquipo.permisos : []),
      permisosExcepcionales: new Set(excepcionales),
      permisosGlobales: new Set(rolGlobal?.permisos ?? []),
      permisosPorCategoria
    };
  }
}
