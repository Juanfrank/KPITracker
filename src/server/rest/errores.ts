import type { Response } from 'express';
import { EntidadNoEncontradaError, NoImplementadoError, ValidacionError } from '@domain/index';

/** Traduce un error de dominio al mismo sobre `{ error, detalles? }` que ya devolvía `RespuestaIpc` — ver `trpc.ts#invocar` para el equivalente tRPC. */
export function responderError(res: Response, error: unknown): void {
  if (error instanceof ValidacionError) {
    res.status(400).json({ error: error.message, detalles: error.detalles });
    return;
  }
  if (error instanceof EntidadNoEncontradaError) {
    res.status(404).json({ error: error.message });
    return;
  }
  if (error instanceof NoImplementadoError) {
    res.status(501).json({ error: error.message });
    return;
  }
  const mensaje = error instanceof Error ? error.message : String(error);
  console.error('Error en ruta REST:', error);
  res.status(500).json({ error: mensaje });
}
