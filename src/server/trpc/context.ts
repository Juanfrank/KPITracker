import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { IdentidadSesion } from '@application/use-cases/ServicioAutenticacion';
import type { AplicacionServidor } from '../composicionServidor';

/** Nombre de la cookie de sesión — firmada (`cookie-parser` con secreto), nunca un JWT autocontenido (ver plan §3). */
export const COOKIE_SESION = 'kpitracker_sesion';

/**
 * Cookie de "Ver como" (Batch U, U2): guarda el id del usuario simulado,
 * SEPARADA de la cookie de sesión real — nunca reemplaza la sesión del
 * administrador, solo se superpone a los `protectedProcedure` que la
 * request atraviese (ver `trpc.ts`) para leer como ese usuario vería la
 * app. Firmada igual que `COOKIE_SESION`; nunca se confía en su valor si la
 * sesión real no es de un administrador (ver `createContext` abajo).
 */
export const COOKIE_SIMULACION = 'kpitracker_simulacion';

export interface Context {
  aplicacion: AplicacionServidor;
  usuario: IdentidadSesion | null;
  /** El token de sesión de la request actual (si la cookie era válida) — lo necesita `auth.logout` para revocarlo. */
  sesionId: string | null;
  /**
   * Usuario que un administrador eligió "ver como" (U2), o `null` fuera de
   * simulación. Solo se resuelve cuando `usuario?.esAdministrador` es
   * verdadero — un usuario no-admin nunca puede activar ni heredar una
   * simulación, aunque la cookie llegara con un valor (defensa en
   * profundidad: hoy solo `simulacion.iniciar`, que es `adminProcedure`,
   * la escribe).
   */
  usuarioSimulado: IdentidadSesion | null;
  res: CreateExpressContextOptions['res'];
}

/**
 * Fábrica de `createContext`: cierra sobre la `AplicacionServidor` (una sola
 * instancia para todo el proceso — un único espacio de trabajo compartido,
 * ver plan §0) y por cada request lee la cookie firmada, valida la sesión
 * contra `ServicioAutenticacion` y arma el contexto tRPC.
 */
export function crearContextFactory(aplicacion: AplicacionServidor) {
  return async function createContext({ req, res }: CreateExpressContextOptions): Promise<Context> {
    const cookies = req.signedCookies as Record<string, string | undefined> | undefined;
    const sesionId = cookies?.[COOKIE_SESION] ?? null;
    const usuario = sesionId ? await aplicacion.autenticacion.validarSesion(sesionId) : null;

    let usuarioSimulado: IdentidadSesion | null = null;
    const simulacionId = cookies?.[COOKIE_SIMULACION] ?? null;
    if (simulacionId && usuario?.esAdministrador) {
      const simulado = await aplicacion.usuarios.obtener(simulacionId);
      if (simulado && !simulado.eliminado) {
        usuarioSimulado = {
          id: simulado.id, nombreUsuario: simulado.nombreUsuario, nombreCompleto: simulado.nombreCompleto,
          esAdministrador: simulado.esAdministrador, rolGlobalId: simulado.rolGlobalId,
          workspaceActualId: simulado.workspaceActualId
        };
      }
    }

    return { aplicacion, usuario, sesionId, usuarioSimulado, res };
  };
}
