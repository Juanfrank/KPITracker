import { router } from './trpc';
import { configRouter } from './routers/config';
import { indicadoresRouter } from './routers/indicadores';
import { atributosRouter } from './routers/atributos';
import { listasRouter } from './routers/listas';
import { metasRouter } from './routers/metas';
import { reglasRouter } from './routers/reglas';
import { periodicidadesRouter } from './routers/periodicidades';
import { responsablesRouter } from './routers/responsables';
import { categoriasRouter } from './routers/categorias';
import { origenesRouter } from './routers/origenes';
import { automatizacionRouter } from './routers/automatizacion';
import { recoleccionRouter } from './routers/recoleccion';
import { seguimientoRouter } from './routers/seguimiento';
import { exportacionRouter } from './routers/exportacion';
import { auditoriaRouter } from './routers/auditoria';
import { tiposRouter } from './routers/tipos';
import { adjuntosRouter } from './routers/adjuntos';
import { sistemaRouter } from './routers/sistema';
import { authRouter } from './routers/auth';
import { usuariosRouter } from './routers/usuarios';

/**
 * Router raíz: un sub-router por prefijo de `CanalesIpc` (ver
 * `src/shared/ipc.ts`), más `auth`/`usuarios` (sin equivalente IPC previo —
 * la app de escritorio no tenía login). `perfiles` NO existe — retirado por
 * decisión del plan de migración (single espacio de trabajo compartido).
 */
export const appRouter = router({
  config: configRouter,
  indicadores: indicadoresRouter,
  atributos: atributosRouter,
  listas: listasRouter,
  metas: metasRouter,
  reglas: reglasRouter,
  periodicidades: periodicidadesRouter,
  responsables: responsablesRouter,
  categorias: categoriasRouter,
  origenes: origenesRouter,
  automatizacion: automatizacionRouter,
  recoleccion: recoleccionRouter,
  seguimiento: seguimientoRouter,
  exportacion: exportacionRouter,
  auditoria: auditoriaRouter,
  tipos: tiposRouter,
  adjuntos: adjuntosRouter,
  sistema: sistemaRouter,
  auth: authRouter,
  usuarios: usuariosRouter
});

export type AppRouter = typeof appRouter;
