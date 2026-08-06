import { z } from 'zod';

/** Validación estructural de `perfiles.json` — ver `GestorPerfiles.cargar()`. */
export const esquemaRegistroPerfiles = z.object({
  version: z.literal(1),
  perfilActivoId: z.string(),
  perfiles: z.array(
    z.object({
      id: z.string().min(1),
      nombre: z.string().min(1),
      ruta: z.string().min(1),
      creadoEn: z.string(),
      actualizadoEn: z.string()
    })
  )
});
