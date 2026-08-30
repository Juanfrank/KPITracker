import { EntidadNoEncontradaError, ValidacionError, permisoGlobalValido } from '@domain/index';
import type { RolGlobal } from '@domain/index';
import type { IRolGlobalRepository, IUsuarioRepository } from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';

/**
 * CRUD del catálogo de roles GLOBALES (Batch AX, fundación SaaS) — mismo
 * patrón que `ServicioRoles`, sin `ambito` (un único catálogo, no
 * particionado por Workspace: los permisos globales son sobre los
 * Workspaces mismos, no algo que viva DENTRO de uno). "Super administrador"
 * (`esSistema: true`) no se puede borrar ni renombrar, pero su lista de
 * permisos sí es editable.
 */
export class ServicioRolesGlobales extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IRolGlobalRepository,
    private readonly usuarios: IUsuarioRepository
  ) {
    super(ctx);
  }

  listar(): Promise<RolGlobal[]> {
    return this.repo.listar();
  }

  async guardar(rol: RolGlobal): Promise<RolGlobal> {
    const errores: string[] = [];
    if (!rol.nombre.trim()) errores.push('El nombre del rol es obligatorio.');
    const anterior = await this.repo.obtener(rol.id);
    if (anterior?.esSistema && anterior.nombre !== rol.nombre) {
      errores.push('No se puede renombrar un rol del sistema.');
    }
    const permisosInvalidos = rol.permisos.filter((p) => !permisoGlobalValido(p));
    if (permisosInvalidos.length > 0) errores.push(`Permiso(s) inválido(s): ${permisosInvalidos.join(', ')}`);
    const otros = await this.repo.listar();
    if (otros.some((r) => r.id !== rol.id && r.nombre.trim().toLowerCase() === rol.nombre.trim().toLowerCase())) {
      errores.push(`Ya existe un rol global con el nombre "${rol.nombre.trim()}".`);
    }
    if (errores.length > 0) throw new ValidacionError('Rol global inválido.', errores);

    const ahora = this.ctx.reloj.ahoraIso();
    const guardado: RolGlobal = anterior
      ? { ...rol, esSistema: anterior.esSistema, creadoEn: anterior.creadoEn, actualizadoEn: ahora }
      : { ...rol, id: rol.id || this.ctx.ids.nuevoId(), esSistema: false, creadoEn: ahora, actualizadoEn: ahora };
    await this.repo.guardar(guardado);
    await this.auditar(anterior ? 'Modificar' : 'Crear', 'RolGlobal', guardado.id, null, null, guardado.nombre);
    return guardado;
  }

  async eliminar(id: string): Promise<void> {
    const rol = await this.repo.obtener(id);
    if (!rol) throw new EntidadNoEncontradaError('RolGlobal', id);
    if (rol.esSistema) throw new ValidacionError(`No se puede eliminar "${rol.nombre}": es un rol del sistema.`);
    const usuarios = await this.usuarios.listar();
    const enUso = usuarios.filter((u) => u.rolGlobalId === id).map((u) => `Usuario: ${u.nombreCompleto || u.nombreUsuario}`);
    if (enUso.length > 0) throw new ValidacionError(`No se puede eliminar "${rol.nombre}": está en uso.`, enUso);
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', 'RolGlobal', id, null, null, rol.nombre);
  }
}
