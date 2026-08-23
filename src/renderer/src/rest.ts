/**
 * Helpers para las rutas REST planas que quedaron fuera de tRPC (archivos:
 * multipart/streaming — ver plan Fase 3 §5 y Fase 4 §9.4). Comparten la
 * misma cookie de sesión firmada que el cliente tRPC (`credentials:
 * 'include'`); a diferencia de `invocar()` no hay envoltura tipada por
 * canal — cada llamador conoce la forma exacta de su endpoint.
 */

async function leerError(respuesta: Response): Promise<never> {
  let mensaje = `Error ${respuesta.status}`;
  let detalles: string[] | undefined;
  try {
    const cuerpo = (await respuesta.json()) as { error?: string; detalles?: string[] };
    if (cuerpo.error) mensaje = cuerpo.error;
    detalles = cuerpo.detalles;
  } catch {
    // Respuesta sin cuerpo JSON (p. ej. 401 genérico) — se usa el mensaje por defecto.
  }
  const error = new Error(mensaje) as Error & { detalles?: string[] };
  error.detalles = detalles;
  throw error;
}

/** `POST` multipart a `ruta` con `campos` (incluye archivos `File`/`Blob`); devuelve el JSON de respuesta. */
export async function subirArchivo<T>(ruta: string, campos: Record<string, string | Blob>): Promise<T> {
  const formulario = new FormData();
  for (const [clave, valor] of Object.entries(campos)) formulario.set(clave, valor);
  const respuesta = await fetch(ruta, { method: 'POST', credentials: 'include', body: formulario });
  if (!respuesta.ok) return leerError(respuesta);
  return (await respuesta.json()) as T;
}

/** `GET ruta` y dispara la descarga del cuerpo de la respuesta como archivo (`nombreSugerido`). */
export async function descargar(ruta: string, nombreSugerido: string): Promise<void> {
  const respuesta = await fetch(ruta, { credentials: 'include' });
  if (!respuesta.ok) return leerError(respuesta);
  const blob = await respuesta.blob();
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombreSugerido;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

/** `POST` de texto plano (p. ej. JSON ya serializado) a `ruta`; devuelve el JSON de respuesta. */
export async function postTexto<T>(ruta: string, texto: string, contentType = 'application/json'): Promise<T> {
  const respuesta = await fetch(ruta, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': contentType },
    body: texto
  });
  if (!respuesta.ok) return leerError(respuesta);
  return (await respuesta.json()) as T;
}
