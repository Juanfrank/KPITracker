import { z } from 'zod';
import { adminProcedure, invocar, router } from '../trpc';

const ROL = z.enum(['admin', 'usuario']);

/** Gestión de usuarios (pantalla de administración) — todo el router exige `rol === 'admin'`. */
export const usuariosRouter = router({
  listar: adminProcedure.query(({ ctx }) => ctx.aplicacion.usuarios.listar()),

  crear: adminProcedure
    .input(z.object({ nombreUsuario: z.string(), nombreCompleto: z.string(), password: z.string(), rol: ROL.default('usuario') }))
    .mutation(({ ctx, input }) =>
      invocar(() => ctx.aplicacion.usuarios.crear(input.nombreUsuario, input.nombreCompleto, input.password, input.rol))
    ),

  cambiarPassword: adminProcedure
    .input(z.object({ id: z.string(), passwordNueva: z.string() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.cambiarPassword(input.id, input.passwordNueva))),

  establecerRol: adminProcedure
    .input(z.object({ id: z.string(), rol: ROL }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerRol(input.id, input.rol))),

  establecerActivo: adminProcedure
    .input(z.object({ id: z.string(), activo: z.boolean() }))
    .mutation(({ ctx, input }) => invocar(() => ctx.aplicacion.usuarios.establecerActivo(input.id, input.activo)))
});
