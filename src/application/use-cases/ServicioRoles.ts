import { EntidadNoEncontradaError, ValidacionError } from '@domain/index';
import type { Rol } from '@domain/index';
import { ambitoDePermiso } from '@domain/index';
import type { IRolRepository } from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';
import { referenciasDeRol } from './referencias';
import type { DepsReferenciasRol } from './referencias';

/**
 * CRUD de roles (Batch T): nombre + lista de `permisos`, todos del mismo
 * `ambito` que el rol (`CATALOGO_PERMISOS` es fijo en código, ver
 * `Permiso.ts` — este servicio solo valida que los ids elegidos existan y
 * coincidan de ámbito). Los 4 roles semilla (`esSistema: true`) no se pueden
 * borrar ni renombrar, pero sus permisos sí son editables — es lo que hace
 * "configurable" al rol Líder de equipo/Colaborador/Visor, tal como se
 * confirmó con el usuario para este batch.
 */
export class ServicioRoles extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IRolRepository,
    private readonly depsReferencias: DepsReferenciasRol
  ) {
    super(ctx);
  }

  listar(): Promise<Rol[]> {
    return this.repo.listar();
  }

  async guardar(rol: Rol): Promise<Rol> {
    const errores: string[] = [];
    if (!rol.nombre.trim()) errores.push('El nombre del rol es obligatorio.');
    const anterior = await this.repo.obtener(rol.id);
    if (anterior?.esSistema && anterior.nombre !== rol.nombre) {
      errores.push('No se puede renombrar un rol del sistema.');
    }
    // El ámbito es inmutable una vez creado (no solo para roles del sistema): cambiarlo
    // dejaría huérfanas las referencias existentes (Usuario.rolGeneralId/rolEquipoId
    // apuntando a un rol que ya no es del ámbito que ese campo espera).
    if (anterior && anterior.ambito !== rol.ambito) {
      errores.push('No se puede cambiar el ámbito de un rol ya creado.');
    }
    const permisosInvalidos = rol.permisos.filter((p) => ambitoDePermiso(p) !== rol.ambito);
    if (permisosInvalidos.length > 0) {
      errores.push(`Permiso(s) inválido(s) o de otro ámbito: ${permisosInvalidos.join(', ')}`);
    }
    const otros = await this.repo.listar();
    if (otros.some((r) => r.id !== rol.id && r.nombre.trim().toLowerCase() === rol.nombre.trim().toLowerCase())) {
      errores.push(`Ya existe un rol con el nombre "${rol.nombre.trim()}".`);
    }
    if (errores.length > 0) throw new ValidacionError('Rol inválido.', errores);

    const ahora = this.ctx.reloj.ahoraIso();
    const guardado: Rol = anterior
      ? { ...rol, esSistema: anterior.esSistema, creadoEn: anterior.creadoEn, actualizadoEn: ahora }
      : { ...rol, id: rol.id || this.ctx.ids.nuevoId(), esSistema: false, creadoEn: ahora, actualizadoEn: ahora };
    await this.repo.guardar(guardado);
    await this.auditar(anterior ? 'Modificar' : 'Crear', 'Rol', guardado.id, null, null, guardado.nombre);
    return guardado;
  }

  async eliminar(id: string): Promise<void> {
    const rol = await this.repo.obtener(id);
    if (!rol) throw new EntidadNoEncontradaError('Rol', id);
    if (rol.esSistema) throw new ValidacionError(`No se puede eliminar "${rol.nombre}": es un rol del sistema.`);
    const referencias = await referenciasDeRol(this.depsReferencias, id);
    if (referencias.length > 0) {
      throw new ValidacionError(`No se puede eliminar "${rol.nombre}": está en uso.`, referencias);
    }
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', 'Rol', id, null, null, rol.nombre);
  }
}
