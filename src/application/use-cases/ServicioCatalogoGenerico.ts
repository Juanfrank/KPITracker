import { ValidacionError } from '@domain/index';
import type { ICatalogoRepository } from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';

interface ItemCatalogo {
  readonly id: string;
  nombre: string;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/**
 * CRUD homogéneo para catálogos simples (Responsable, Categoria, ...):
 * valida el nombre, gestiona creadoEn/actualizadoEn y audita. Una
 * instancia por catálogo, parametrizada con el repositorio y el nombre de
 * entidad para la auditoría (evita duplicar esta clase por cada catálogo).
 */
export class ServicioCatalogoGenerico<T extends ItemCatalogo> extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: ICatalogoRepository<T>,
    private readonly nombreEntidad: string
  ) {
    super(ctx);
  }

  listar(): Promise<T[]> {
    return this.repo.listar();
  }

  async guardar(item: T): Promise<T> {
    if (!item.nombre.trim()) {
      throw new ValidacionError(`El nombre de ${this.nombreEntidad.toLowerCase()} es obligatorio.`);
    }
    const anterior = await this.repo.obtener(item.id);
    const ahora = this.ctx.reloj.ahoraIso();
    const guardado: T = anterior
      ? { ...item, creadoEn: anterior.creadoEn, actualizadoEn: ahora }
      : { ...item, id: item.id || this.ctx.ids.nuevoId(), creadoEn: ahora, actualizadoEn: ahora };
    await this.repo.guardar(guardado);
    await this.auditar(anterior ? 'Modificar' : 'Crear', this.nombreEntidad, guardado.id, null, null, guardado.nombre);
    return guardado;
  }

  async eliminar(id: string): Promise<void> {
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', this.nombreEntidad, id);
  }
}
