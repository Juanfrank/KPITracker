import { z } from 'zod';

/**
 * Guardias mínimas y deliberadamente laxas contra el hallazgo LOW-1 del
 * audit de seguridad: casi toda mutación `guardar` aceptaba `z.any()` —
 * literalmente cualquier valor (`null`, un string, un array, un número)
 * llegaba sin ningún chequeo hasta el `Servicio*.guardar()` correspondiente,
 * que asume que el payload YA es un objeto con la forma del dominio. Estas
 * guardias no reemplazan la validación de negocio (que sigue viviendo en
 * cada `Servicio*`, con sus propios mensajes) — solo cierran la clase de
 * error más básica: un payload que ni siquiera es un objeto plano.
 * Deliberadamente NO listan cada campo de cada entidad (eso arriesgaría
 * rechazar un guardado legítimo por un campo que este límite de transporte
 * no conoce todavía) — la validación real sigue viviendo, sin duplicarse,
 * en el dominio/aplicación.
 *
 * `z.custom<any>(...)`: SÍ valida en runtime (rechaza cualquier cosa que no
 * sea un objeto plano, o al que le falte `id`/`categoriaId`) — pero declarar
 * el tipo TS resultante como `any` evita dos pozos conocidos de zod+
 * TypeScript al mezclarlo con los ~20 call-sites ya tipados de este código
 * (`Rol`, `Categoria`, `Equipo`, ...): un schema `.passthrough()` declara su
 * entrada con una firma de índice explícita, que TypeScript rechaza al
 * recibir una interfaz de dominio sin esa firma
 * (`trpcClient.roles.guardar.mutate(rol)`); y un tipo más preciso como
 * `object & { id: string }` dispara el "excess property check" de
 * TypeScript sobre los literales de objeto que arman los tests de
 * integración. `any` es exactamente el mismo contrato de tipos que ya tenía
 * `z.any()` — el cambio real es 100% en runtime, no en compilación.
 */
function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function esObjetoConId(valor: unknown): boolean {
  return esObjeto(valor) && typeof valor.id === 'string';
}

/* eslint-disable @typescript-eslint/no-explicit-any -- ver docstring arriba: `any` es deliberado, la validación real es en runtime. */

/** Para las entidades de catálogo (Categoria, Equipo, Lista, Rol, OrigenAutomatico, ...): siempre traen `id: string` (vacío al crear). */
export const objetoConId = z.custom<any>(esObjetoConId, { message: 'Se esperaba un objeto con un campo "id" (string).' });

/** Para payloads sin `id` propio (ConfiguracionGeneral, ValorAtributoEntidad, mapeos de importación, ...): cualquier objeto plano. */
export const objetoLibre = z.custom<any>(esObjeto, { message: 'Se esperaba un objeto.' });

/** `indicadores.guardar` — envoltorio `{ indicador, valores }`, no la entidad misma en el nivel superior. */
export const guardarIndicadorSchema = z.custom<any>(
  (valor) => esObjeto(valor) && esObjetoConId(valor.indicador) && Array.isArray(valor.valores),
  { message: 'Se esperaba { indicador: { id, ... }, valores: [] }.' }
);

/** `medicionCategoria.guardar`/`ConfiguracionMedicionCategoria` — clave propia es `categoriaId`, no `id`. */
export const objetoConCategoriaId = z.custom<any>(
  (valor) => esObjeto(valor) && typeof valor.categoriaId === 'string',
  { message: 'Se esperaba un objeto con un campo "categoriaId" (string).' }
);

/* eslint-enable @typescript-eslint/no-explicit-any */
