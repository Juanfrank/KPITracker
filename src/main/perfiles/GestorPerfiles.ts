import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { app } from 'electron';
import type { IClock, IIdGenerator } from '@application/ports/index';
import { EntidadNoEncontradaError, ValidacionError } from '@domain/index';
import type { PerfilRegistrado, RegistroPerfiles } from '@shared/perfiles';
import { esquemaRegistroPerfiles } from './esquemaRegistro';

/**
 * `perfiles.json` vive como HERMANO del directorio de datos, nunca dentro
 * (para que borrar un perfil no se lleve el registro que lo lista). En
 * pruebas E2E, `KPITRACKER_DATA_DIR` ya fija un tmpdir para el perfil
 * "Predeterminado" — el registro cae junto a él, sin tocar el userData real.
 *
 * El nombre del archivo incluye el nombre del propio tmpdir (no un
 * `perfiles.json` fijo): cada `mkdtempSync(join(tmpdir(), 'prefijo-'))` de
 * un spec de E2E comparte el mismo directorio padre (la raíz temporal del
 * SO), así que un nombre fijo colisionaría entre corridas — el registro de
 * una corrida anterior "ganaría" y apuntaría a un directorio ya borrado.
 */
export function rutaRegistroPerfiles(): string {
  const override = process.env.KPITRACKER_DATA_DIR;
  return override
    ? join(dirname(override), `perfiles-${basename(override)}.json`)
    : join(app.getPath('userData'), 'perfiles.json');
}

export function directorioBasePerfiles(): string {
  const override = process.env.KPITRACKER_DATA_DIR;
  return override ? dirname(override) : app.getPath('userData');
}

const NOMBRE_PREDETERMINADO = 'Predeterminado';

function slug(nombre: string): string {
  const normalizado = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas diacríticas combinadas (acentos) tras la normalización NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalizado || 'perfil';
}

/**
 * Gestiona el registro de perfiles (crear/renombrar/eliminar/cambiar) y su
 * migración de primer arranque. Recibe todas las rutas por constructor —
 * sin tocar `electron` directamente— para ser 100% testeable con un tmpdir.
 */
export class GestorPerfiles {
  constructor(
    private readonly rutaRegistro: string,
    private readonly directorioBase: string,
    private readonly rutaDatosHeredada: string,
    private readonly ids: IIdGenerator,
    private readonly reloj: IClock
  ) {}

  /**
   * Lee el registro; si no existe, migra el directorio de datos heredado
   * (tal cual, sin mover un solo archivo) a un perfil "Predeterminado". Si
   * existe pero está corrupto, lo renombra a `.corrupto-<timestamp>` y
   * regenera igual — nunca deja al usuario sin acceso a sus datos por un
   * JSON roto. Si `perfilActivoId` no resuelve (el usuario borró una
   * carpeta a mano), cae al primer perfil de la lista.
   */
  async cargar(): Promise<RegistroPerfiles> {
    let bruto: string;
    try {
      bruto = await readFile(this.rutaRegistro, 'utf-8');
    } catch {
      return this.primerArranque();
    }

    let candidato: unknown;
    try {
      candidato = JSON.parse(bruto);
    } catch {
      await this.marcarComoCorrupto();
      return this.primerArranque();
    }
    const resultado = esquemaRegistroPerfiles.safeParse(candidato);
    if (!resultado.success) {
      await this.marcarComoCorrupto();
      return this.primerArranque();
    }

    let registro = resultado.data;
    if (!registro.perfiles.some((p) => p.id === registro.perfilActivoId)) {
      const primero = registro.perfiles[0];
      if (!primero) return this.primerArranque();
      registro = { ...registro, perfilActivoId: primero.id };
      await this.escribir(registro);
    }
    return registro;
  }

  private async marcarComoCorrupto(): Promise<void> {
    try {
      await rename(this.rutaRegistro, `${this.rutaRegistro}.corrupto-${Date.now()}`);
    } catch {
      // Si ni siquiera se puede renombrar, primerArranque() lo sobrescribirá igual.
    }
  }

  private async primerArranque(): Promise<RegistroPerfiles> {
    const ahora = this.reloj.ahoraIso();
    const predeterminado: PerfilRegistrado = {
      id: this.ids.nuevoId(),
      nombre: NOMBRE_PREDETERMINADO,
      ruta: this.rutaDatosHeredada,
      creadoEn: ahora,
      actualizadoEn: ahora
    };
    const registro: RegistroPerfiles = { version: 1, perfilActivoId: predeterminado.id, perfiles: [predeterminado] };
    await this.escribir(registro);
    return registro;
  }

  /** Escritura atómica: `.tmp` + rename, para no dejar `perfiles.json` a medio escribir si el proceso muere. */
  private async escribir(registro: RegistroPerfiles): Promise<void> {
    await mkdir(this.directorioBase, { recursive: true });
    const temporal = `${this.rutaRegistro}.tmp`;
    await writeFile(temporal, JSON.stringify(registro, null, 2), 'utf-8');
    await rename(temporal, this.rutaRegistro);
  }

  async listar(): Promise<{ perfiles: PerfilRegistrado[]; activoId: string }> {
    const registro = await this.cargar();
    return { perfiles: registro.perfiles, activoId: registro.perfilActivoId };
  }

  async rutaActiva(): Promise<string> {
    const registro = await this.cargar();
    const activo = registro.perfiles.find((p) => p.id === registro.perfilActivoId);
    if (!activo) throw new EntidadNoEncontradaError('Perfil', registro.perfilActivoId);
    return activo.ruta;
  }

  async crear(nombre: string): Promise<PerfilRegistrado> {
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) throw new ValidacionError('El nombre del perfil es obligatorio.');
    const registro = await this.cargar();
    if (registro.perfiles.some((p) => p.nombre.toLowerCase() === nombreLimpio.toLowerCase())) {
      throw new ValidacionError(`Ya existe un perfil llamado "${nombreLimpio}".`);
    }
    const id = this.ids.nuevoId();
    const ahora = this.reloj.ahoraIso();
    const nuevo: PerfilRegistrado = {
      id,
      nombre: nombreLimpio,
      // Sufijo del id: evita colisiones de ruta si dos perfiles terminan con el mismo slug (p. ej. tras un renombrado).
      ruta: join(this.directorioBase, `${slug(nombreLimpio)}-${id.slice(0, 8)}`),
      creadoEn: ahora,
      actualizadoEn: ahora
    };
    await mkdir(nuevo.ruta, { recursive: true });
    const actualizado: RegistroPerfiles = { ...registro, perfiles: [...registro.perfiles, nuevo] };
    await this.escribir(actualizado);
    return nuevo;
  }

  async renombrar(id: string, nombre: string): Promise<PerfilRegistrado> {
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) throw new ValidacionError('El nombre del perfil es obligatorio.');
    const registro = await this.cargar();
    const perfil = registro.perfiles.find((p) => p.id === id);
    if (!perfil) throw new EntidadNoEncontradaError('Perfil', id);
    if (registro.perfiles.some((p) => p.id !== id && p.nombre.toLowerCase() === nombreLimpio.toLowerCase())) {
      throw new ValidacionError(`Ya existe un perfil llamado "${nombreLimpio}".`);
    }
    const actualizado: PerfilRegistrado = { ...perfil, nombre: nombreLimpio, actualizadoEn: this.reloj.ahoraIso() };
    const registroActualizado: RegistroPerfiles = {
      ...registro,
      perfiles: registro.perfiles.map((p) => (p.id === id ? actualizado : p))
    };
    await this.escribir(registroActualizado);
    return actualizado;
  }

  async eliminar(id: string, borrarArchivos: boolean): Promise<void> {
    const registro = await this.cargar();
    const perfil = registro.perfiles.find((p) => p.id === id);
    if (!perfil) throw new EntidadNoEncontradaError('Perfil', id);
    if (id === registro.perfilActivoId) {
      throw new ValidacionError('No se puede eliminar el perfil activo: cambie a otro perfil primero.');
    }
    if (registro.perfiles.length <= 1) {
      throw new ValidacionError('No se puede eliminar el último perfil.');
    }
    const registroActualizado: RegistroPerfiles = { ...registro, perfiles: registro.perfiles.filter((p) => p.id !== id) };
    await this.escribir(registroActualizado);
    if (borrarArchivos) {
      await rm(perfil.ruta, { recursive: true, force: true });
    }
  }

  async marcarActivo(id: string): Promise<PerfilRegistrado> {
    const registro = await this.cargar();
    const perfil = registro.perfiles.find((p) => p.id === id);
    if (!perfil) throw new EntidadNoEncontradaError('Perfil', id);
    await this.escribir({ ...registro, perfilActivoId: id });
    return perfil;
  }
}
