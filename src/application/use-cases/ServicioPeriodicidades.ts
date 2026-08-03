import type { DefinicionPeriodicidad } from '@domain/index';
import { ValidacionError, validarDefinicionPeriodicidad } from '@domain/index';
import type { IDefinicionPeriodicidadRepository } from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';

/** Administración de definiciones de periodicidad personalizada (cortes del año). */
export class ServicioPeriodicidades extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IDefinicionPeriodicidadRepository
  ) {
    super(ctx);
  }

  listar(): Promise<DefinicionPeriodicidad[]> {
    return this.repo.listar();
  }

  obtener(id: string): Promise<DefinicionPeriodicidad | null> {
    return this.repo.obtener(id);
  }

  async guardar(definicion: DefinicionPeriodicidad): Promise<DefinicionPeriodicidad> {
    if (!definicion.nombre.trim()) throw new ValidacionError('El nombre de la definición es obligatorio.');
    const errores = validarDefinicionPeriodicidad(definicion.cortes);
    if (errores.length > 0) throw new ValidacionError('La definición de periodicidad no es válida.', errores);

    const anterior = await this.repo.obtener(definicion.id);
    const ahora = this.ctx.reloj.ahoraIso();
    const guardada: DefinicionPeriodicidad = anterior
      ? { ...definicion, creadoEn: anterior.creadoEn, actualizadoEn: ahora }
      : { ...definicion, id: definicion.id || this.ctx.ids.nuevoId(), creadoEn: ahora, actualizadoEn: ahora };
    await this.repo.guardar(guardada);
    await this.auditar(
      anterior ? 'Modificar' : 'Crear', 'DefinicionPeriodicidad', guardada.id, null, null, JSON.stringify(guardada.cortes)
    );
    this.sincronizarExport();
    return guardada;
  }

  async eliminar(id: string): Promise<void> {
    await this.repo.eliminar(id);
    await this.auditar('Eliminar', 'DefinicionPeriodicidad', id);
    this.sincronizarExport();
  }
}
