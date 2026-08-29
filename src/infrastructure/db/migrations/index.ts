import type { Knex } from 'knex';
import * as esquemaInicial from './20260101000000_esquema_inicial';
import * as categoriasEquipos from './20260825000000_categorias_equipos';
import * as rolesPermisos from './20260901000000_roles_permisos';
import * as unificarUsuarioResponsable from './20260915000000_unificar_usuario_responsable';
import * as requiereValidacion from './20260920000000_requiere_validacion';
import * as metaPeriodoId from './20260925000000_meta_periodo_id';
import * as rolesValidadorTecnico from './20260930000000_roles_validador_tecnico';
import * as rolAdministrador from './20261010000000_rol_administrador';
import * as medicion from './20261015000000_medicion';

interface ModuloMigracion {
  up(knex: Knex): Promise<void>;
  down(knex: Knex): Promise<void>;
}

const MIGRACIONES: Array<{ nombre: string; modulo: ModuloMigracion }> = [
  { nombre: '20260101000000_esquema_inicial', modulo: esquemaInicial },
  { nombre: '20260825000000_categorias_equipos', modulo: categoriasEquipos },
  { nombre: '20260901000000_roles_permisos', modulo: rolesPermisos },
  { nombre: '20260915000000_unificar_usuario_responsable', modulo: unificarUsuarioResponsable },
  { nombre: '20260920000000_requiere_validacion', modulo: requiereValidacion },
  { nombre: '20260925000000_meta_periodo_id', modulo: metaPeriodoId },
  { nombre: '20260930000000_roles_validador_tecnico', modulo: rolesValidadorTecnico },
  { nombre: '20261010000000_rol_administrador', modulo: rolAdministrador },
  { nombre: '20261015000000_medicion', modulo: medicion }
];

/**
 * Fuente de migraciones en memoria: Knex normalmente escanea un directorio
 * del sistema de archivos, pero eso es fragil bajo un bundler (electron-vite
 * empaqueta `src/main/**` en un único archivo; un directorio de migraciones
 * junto a él no se copia automáticamente). Importar los módulos de
 * migración directamente (arriba) y exponerlos vía esta fuente programática
 * evita depender de resolución de rutas en tiempo de ejecución — funciona
 * igual empaquetado o no, y es el mismo mecanismo tanto en la app de
 * escritorio (Fase 2) como en el futuro servidor (Fase 3+).
 */
export class FuenteMigracionesEnMemoria implements Knex.MigrationSource<string> {
  getMigrations(): Promise<string[]> {
    return Promise.resolve(MIGRACIONES.map((m) => m.nombre));
  }

  getMigrationName(migration: string): string {
    return migration;
  }

  getMigration(migration: string): Promise<Knex.Migration> {
    const encontrada = MIGRACIONES.find((m) => m.nombre === migration);
    if (!encontrada) throw new Error(`Migración "${migration}" no encontrada.`);
    return Promise.resolve(encontrada.modulo);
  }
}
