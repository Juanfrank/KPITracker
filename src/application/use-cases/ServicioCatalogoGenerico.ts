import { EntidadNoEncontradaError, ValidacionError } from '@domain/index';
import type { ICatalogoRepository } from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';

interface ItemCatalogo {
  readonly id: string;
  nombre: string;
  activo: boolean;
  eliminado: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}

/** Verifica referencias antes de un borrado lógico; devuelve descripciones legibles de lo que lo usa (vacío = sin bloqueo). */
export type VerificadorReferencias = (id: string) => Promise<string[]>;

/**
 * CRUD homogéneo para catálogos con borrado lógico (Responsable, Categoria,
 * OrigenAutomatico, ...): valida el nombre, gestiona creadoEn/actualizadoEn
 * y audita. Una instancia por catálogo, parametrizada con el repositorio y
 * el nombre de entidad para la auditoría (evita duplicar esta clase por
 * cada catálogo).
 *
 * `eliminar()` no borra físicamente: verifica referencias (bloquea con un
 * mensaje que lista qué lo usa, vía `verificarReferencias`) y marca
 * `eliminado = true` — reversible vía `restaurar()`. `periodicidades_personalizadas`
 * queda fuera de esta clase (sigue con hard-delete en `ServicioPeriodicidades`).
 */
export class ServicioCatalogoGenerico<T extends ItemCatalogo> extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: ICatalogoRepository<T>,
    private readonly nombreEntidad: string,
    private readonly verificarReferencias: VerificadorReferencias = async () => []
  ) {
    super(ctx);
  }

  listar(incluirEliminados = false): Promise<T[]> {
    return this.repo.listar(incluirEliminados);
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
    const item = await this.repo.obtener(id);
    if (!item) throw new EntidadNoEncontradaError(this.nombreEntidad, id);

    const referencias = await this.verificarReferencias(id);
    if (referencias.length > 0) {
      throw new ValidacionError(`No se puede eliminar "${item.nombre}": está en uso.`, referencias);
    }
    await this.repo.marcarEliminado(id, true);
    await this.auditar('Eliminar', this.nombreEntidad, id, null, null, item.nombre);
  }

  async restaurar(id: string): Promise<void> {
    const item = await this.repo.obtener(id);
    if (!item) throw new EntidadNoEncontradaError(this.nombreEntidad, id);
    await this.repo.marcarEliminado(id, false);
    await this.auditar('Restaurar', this.nombreEntidad, id, null, null, item.nombre);
  }
}
