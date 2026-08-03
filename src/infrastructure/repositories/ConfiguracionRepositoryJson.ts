import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { ConfiguracionGeneral } from '@domain/index';
import { configuracionPorDefecto } from '@domain/index';
import type { IConfiguracionRepository } from '@application/ports/index';
import type { RutasDataLake } from '../parquet/RutasDataLake';

/**
 * La configuración general vive en Configuracion.json (legible y portable).
 * Escritura atómica: se escribe a un archivo temporal y se renombra.
 */
export class ConfiguracionRepositoryJson implements IConfiguracionRepository {
  constructor(private readonly rutas: RutasDataLake) {}

  async obtener(): Promise<ConfiguracionGeneral> {
    const ruta = this.rutas.archivoConfiguracion;
    if (!existsSync(ruta)) return configuracionPorDefecto();
    try {
      const contenido = JSON.parse(readFileSync(ruta, 'utf-8')) as Partial<ConfiguracionGeneral>;
      return { ...configuracionPorDefecto(), ...contenido };
    } catch {
      return configuracionPorDefecto();
    }
  }

  async guardar(config: ConfiguracionGeneral): Promise<void> {
    const ruta = this.rutas.archivoConfiguracion;
    const temporal = `${ruta}.tmp`;
    writeFileSync(temporal, JSON.stringify(config, null, 2), 'utf-8');
    renameSync(temporal, ruta);
  }
}
