/**
 * Registro de perfiles (Batch P): compartido entre main (`GestorPerfiles`)
 * y renderer (canales `perfiles:*`). `perfiles.json` vive como HERMANO del
 * directorio de datos (nunca dentro) — ver `rutaRegistroPerfiles` en
 * `src/main/perfiles/GestorPerfiles.ts`.
 */
export interface PerfilRegistrado {
  id: string;
  nombre: string;
  /** Ruta absoluta al directorio de datos de este perfil (equivalente a lo que hoy es `/Data`). */
  ruta: string;
  readonly creadoEn: string;
  actualizadoEn: string;
}

export interface RegistroPerfiles {
  version: 1;
  perfilActivoId: string;
  perfiles: PerfilRegistrado[];
}
