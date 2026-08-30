import { ValidacionError, tipoAgregacionBaseValido } from '@domain/index';
import type { ConfiguracionMedicionEquipo, Equipo } from '@domain/index';
import type { ICatalogoRepository, IMedicionEquipoRepository } from '@application/ports/index';
import { ServicioBase } from './base';
import type { ContextoAplicacion } from './base';

const CONFIG_POR_DEFECTO = (equipoId: string): ConfiguracionMedicionEquipo => ({
  equipoId, reglaGeneral: 'promedio', tratamientoIndicadores: {}, acotarAl100: true, actualizadoEn: ''
});

/**
 * "Medición por equipo" (pedido explícito del usuario: la misma
 * configuración de resumen que ya tenían las categorías, Batch Y7, extendida
 * a Equipos) — mismo contrato y semántica que `ServicioMedicionCategoria`,
 * pero solo CRUD: no hay un `calcular()` propio análogo (sin consumidor
 * hoy — el subtotal por equipo en Seguimiento > Histórico se calcula
 * enteramente en el cliente, ver `SeguimientoPage.tsx`, igual que ya hacía
 * para categorías). Antes de esto, un equipo/sub-equipo SIEMPRE usaba
 * promedio simple sin excepciones (ver `AT4` de `medicionToggles.spec.ts`,
 * que sigue en verde sin cambios: sin config guardada explícita, el
 * default sigue siendo promedio simple — lo nuevo es que ahora ES
 * configurable, igual que una categoría).
 */
export class ServicioMedicionEquipo extends ServicioBase {
  constructor(
    ctx: ContextoAplicacion,
    private readonly repo: IMedicionEquipoRepository,
    private readonly equiposRepo: ICatalogoRepository<Equipo>
  ) {
    super(ctx);
  }

  async obtener(equipoId: string): Promise<ConfiguracionMedicionEquipo> {
    return (await this.repo.obtener(equipoId)) ?? CONFIG_POR_DEFECTO(equipoId);
  }

  async guardar(config: ConfiguracionMedicionEquipo): Promise<ConfiguracionMedicionEquipo> {
    const errores: string[] = [];
    if (!(await this.equiposRepo.obtener(config.equipoId))) errores.push('El equipo no existe.');
    if (!tipoAgregacionBaseValido(config.reglaGeneral)) errores.push('La regla general de agregación no es válida.');
    for (const [indicadorId, tratamiento] of Object.entries(config.tratamientoIndicadores)) {
      if (tratamiento.agregacionPropia && !tipoAgregacionBaseValido(tratamiento.agregacionPropia)) {
        errores.push(`La agregación propia del indicador "${indicadorId}" no es válida.`);
      }
      if (tratamiento.peso != null && tratamiento.peso < 0) errores.push(`El peso del indicador "${indicadorId}" no puede ser negativo.`);
    }
    if (errores.length > 0) throw new ValidacionError('Configuración de medición inválida.', errores);

    const guardado: ConfiguracionMedicionEquipo = { ...config, actualizadoEn: this.ctx.reloj.ahoraIso() };
    await this.repo.guardar(guardado);
    await this.auditar('Modificar', 'ConfiguracionMedicionEquipo', config.equipoId, null, null, config.reglaGeneral);
    return guardado;
  }
}
