import { crearInfraestructura } from '@infrastructure/bootstrap';
import { componerManejadores } from '@composicion/manejadores';
import type { Aplicacion } from '@composicion/manejadores';
import type { IClock, IIdGenerator, IPasswordHasher } from '@application/ports/index';
import type { Usuario } from '@domain/index';
import { ProveedorPassword } from '@infrastructure/auth/ProveedorPassword';
import { ServicioAutenticacion } from '@application/use-cases/ServicioAutenticacion';
import { ServicioUsuarios } from '@application/use-cases/ServicioUsuarios';

/**
 * `Aplicacion` (el mismo tipo que usa Electron) más los dos servicios de
 * autenticación/usuarios que solo tiene sentido cablear en un entorno
 * multi-usuario real — la app de escritorio, con un único `USUARIO_LOCAL`
 * implícito, nunca los necesitó.
 */
export interface AplicacionServidor extends Aplicacion {
  autenticacion: ServicioAutenticacion;
  usuarios: ServicioUsuarios;
}

/**
 * Composition root del servidor Express: construye la infraestructura con
 * `ArchivoServiceWeb` (el valor por defecto de `crearInfraestructura`, ver
 * `bootstrap.ts` — deliberadamente NO se pasa `crearArchivos` aquí, así este
 * archivo nunca importa nada de Electron) y agrega el andamiaje de
 * autenticación. Si la tabla `usuarios` está vacía (primer arranque contra
 * una base nueva), crea un administrador inicial — ver `asegurarAdminInicial`.
 */
export async function componerAplicacionServidor(dataDir: string, appVersion?: string): Promise<AplicacionServidor> {
  const infra = await crearInfraestructura(dataDir, { appVersion });
  const { manejadores, servicios } = componerManejadores(infra);

  const hasher = new ProveedorPassword(infra.usuarios);
  const autenticacion = new ServicioAutenticacion(hasher, infra.usuarios, infra.sesiones, infra.ids, infra.reloj);
  const usuarios = new ServicioUsuarios(infra.usuarios, infra.ids, infra.reloj, hasher);

  await asegurarAdminInicial(infra.usuarios, hasher, infra.ids, infra.reloj);

  return {
    infra,
    manejadores,
    servicios,
    autenticacion,
    usuarios,
    cerrar: () => infra.cerrar()
  };
}

/**
 * Sin un flujo de aprovisionamiento (ni Perfiles, que traía su propia
 * migración de "primer arranque"), una base `usuarios` nueva no tiene forma
 * de crear su primer administrador — nadie podría iniciar sesión. Se
 * resuelve creando uno automáticamente en el primer arranque, con
 * credenciales configurables por entorno (`ADMIN_INICIAL_USUARIO`/
 * `ADMIN_INICIAL_PASSWORD`) y un valor por defecto solo para desarrollo,
 * con una advertencia bien visible en consola para cambiarlo de inmediato.
 */
async function asegurarAdminInicial(
  usuarios: { listar(): Promise<unknown[]>; guardar(u: Usuario): Promise<void> },
  hasher: IPasswordHasher,
  ids: IIdGenerator,
  reloj: IClock
): Promise<void> {
  if ((await usuarios.listar()).length > 0) return;

  const nombreUsuario = process.env.ADMIN_INICIAL_USUARIO ?? 'admin';
  const passwordConfigurada = process.env.ADMIN_INICIAL_PASSWORD;
  const password = passwordConfigurada ?? 'admin1234';
  const ahora = reloj.ahoraIso();

  await usuarios.guardar({
    id: ids.nuevoId(),
    nombreUsuario,
    nombreCompleto: 'Administrador',
    passwordHash: await hasher.hashear(password),
    rol: 'admin',
    activo: true,
    creadoEn: ahora,
    actualizadoEn: ahora
  });

  console.warn(
    `[KPITracker] No había usuarios — se creó el administrador inicial "${nombreUsuario}".` +
      (passwordConfigurada
        ? ''
        : ' Contraseña por defecto "admin1234" — cámbiela de inmediato (o defina ADMIN_INICIAL_PASSWORD antes del primer arranque).')
  );
}
