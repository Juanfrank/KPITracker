import { crearInfraestructura } from '@infrastructure/bootstrap';
import { componerManejadores } from '@composicion/manejadores';
import type { Aplicacion } from '@composicion/manejadores';
import type { IClock, IIdGenerator, IPasswordHasher } from '@application/ports/index';
import type { Usuario, Workspace } from '@domain/index';
import { ID_EQUIPO_GENERAL, ID_ROL_GLOBAL_SUPER_ADMINISTRADOR, ID_WORKSPACE_DEFAULT } from '@domain/index';
import { ProveedorPassword } from '@infrastructure/auth/ProveedorPassword';
import { LimitadorIntentosLoginMemoria } from '@infrastructure/auth/LimitadorIntentosLoginMemoria';
import { ServicioAutenticacion, HORAS_EXPIRACION_SESION } from '@application/use-cases/ServicioAutenticacion';
import { ServicioCatalogoGenerico } from '@application/use-cases/ServicioCatalogoGenerico';
import { ServicioPermisos } from '@application/use-cases/ServicioPermisos';
import { ServicioRolesGlobales } from '@application/use-cases/ServicioRolesGlobales';
import { ServicioUsuarios } from '@application/use-cases/ServicioUsuarios';
import { referenciasDeWorkspace } from '@application/use-cases/referencias';

/**
 * `Aplicacion` (el mismo tipo que usa Electron) más los servicios de
 * autenticación/usuarios/permisos que solo tiene sentido cablear en un
 * entorno multi-usuario real — la app de escritorio, con un único
 * `USUARIO_LOCAL` implícito, nunca los necesitó. Batch AX (fundación SaaS)
 * agrega `workspaces`/`rolesGlobales` — mismo motivo, la app de escritorio
 * (retirada) nunca tuvo noción de múltiples Workspaces.
 */
export interface AplicacionServidor extends Aplicacion {
  autenticacion: ServicioAutenticacion;
  usuarios: ServicioUsuarios;
  permisos: ServicioPermisos;
  workspaces: ServicioCatalogoGenerico<Workspace>;
  rolesGlobales: ServicioRolesGlobales;
}

/**
 * Composition root del servidor Express: construye la infraestructura con
 * `ArchivoServiceWeb` (el valor por defecto de `crearInfraestructura`, ver
 * `bootstrap.ts` — deliberadamente NO se pasa `crearArchivos` aquí, así este
 * archivo nunca importa nada de Electron) y agrega el andamiaje de
 * autenticación. Si la tabla `usuarios` está vacía (primer arranque contra
 * una base nueva), crea un administrador inicial — ver `asegurarAdminInicial`.
 * Las categorías/equipos "General" y los roles semilla (Batch T) se siembran
 * en la propia migración (`20260901000000_roles_permisos.ts`), no acá — a
 * diferencia del admin inicial, no dependen de si hay usuarios. Batch AX: el
 * Workspace por defecto y el rol global "Super administrador" siguen el
 * mismo criterio (sembrados en `20261120000000_workspaces.ts`).
 */
export async function componerAplicacionServidor(dataDir: string, appVersion?: string): Promise<AplicacionServidor> {
  const infra = await crearInfraestructura(dataDir, { appVersion });
  const { manejadores, servicios } = componerManejadores(infra);

  const hasher = new ProveedorPassword(infra.usuarios);
  // Freno de fuerza bruta en auth.login (audit de seguridad, MEDIUM) — ver docstring de ServicioAutenticacion.iniciarSesion.
  const limitadorIntentos = new LimitadorIntentosLoginMemoria();
  const autenticacion = new ServicioAutenticacion(
    hasher, infra.usuarios, infra.sesiones, infra.ids, infra.reloj, HORAS_EXPIRACION_SESION, limitadorIntentos
  );
  const usuarios = new ServicioUsuarios(
    infra.usuarios, infra.ids, infra.reloj, hasher, infra.roles, infra.permisosExcepcionales, infra.permisosCategoria,
    infra.equipos, infra.indicadores, infra.credencialesGeneradas, ID_EQUIPO_GENERAL,
    infra.rolesGlobales, infra.workspaces
  );
  const permisos = new ServicioPermisos(
    infra.usuarios, infra.roles, infra.permisosExcepcionales, infra.rolesGlobales, infra.permisosCategoria
  );
  const ctxAplicacion = { auditoria: infra.auditoria, reloj: infra.reloj, ids: infra.ids, exportacion: infra.exportacion };
  const workspaces = new ServicioCatalogoGenerico(
    ctxAplicacion, infra.workspaces, 'Workspace',
    (id) => referenciasDeWorkspace({ usuarios: infra.usuarios, roles: infra.roles }, id)
  );
  const rolesGlobales = new ServicioRolesGlobales(ctxAplicacion, infra.rolesGlobales, infra.usuarios);

  await asegurarAdminInicial(infra.usuarios, hasher, infra.ids, infra.reloj, infra.credencialesGeneradas);

  return {
    infra,
    manejadores,
    servicios,
    autenticacion,
    usuarios,
    permisos,
    workspaces,
    rolesGlobales,
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
 * Batch AX: además nace con el rol global "Super administrador" y en el
 * Workspace por defecto — así, en una base completamente nueva, ya puede
 * de inmediato crear otros Workspaces y cambiar entre ellos.
 */
async function asegurarAdminInicial(
  usuarios: { listar(): Promise<unknown[]>; guardar(u: Usuario): Promise<void> },
  hasher: IPasswordHasher,
  ids: IIdGenerator,
  reloj: IClock,
  credencialesRepo: { registrar(usuarioId: string, passwordTexto: string): Promise<void> }
): Promise<void> {
  if ((await usuarios.listar()).length > 0) return;

  const nombreUsuario = process.env.ADMIN_INICIAL_USUARIO ?? 'admin';
  const passwordConfigurada = process.env.ADMIN_INICIAL_PASSWORD;
  const password = passwordConfigurada ?? 'admin1234';
  const ahora = reloj.ahoraIso();
  const id = ids.nuevoId();

  await usuarios.guardar({
    id,
    nombreUsuario,
    nombreCompleto: 'Administrador',
    correo: null,
    passwordHash: await hasher.hashear(password),
    esAdministrador: true,
    rolGeneralId: null,
    equipoId: null,
    rolEquipoId: null,
    rolGlobalId: ID_ROL_GLOBAL_SUPER_ADMINISTRADOR,
    workspaceActualId: ID_WORKSPACE_DEFAULT,
    activo: true,
    eliminado: false,
    creadoEn: ahora,
    actualizadoEn: ahora
  });

  // Audit de seguridad (MEDIUM): con la contraseña por defecto ("admin1234"), no basta con la
  // advertencia en consola — se registra como credencial pendiente (mismo mecanismo que ya usa
  // ServicioUsuarios para cuentas auto-creadas, ver `ICredencialGeneradaRepository`), y
  // `protectedProcedure` (trpc.ts) bloquea toda mutación de este admin hasta que la cambie.
  if (!passwordConfigurada) await credencialesRepo.registrar(id, password);

  console.warn(
    `[KPITracker] No había usuarios — se creó el administrador inicial "${nombreUsuario}".` +
      (passwordConfigurada
        ? ''
        : ' Contraseña por defecto "admin1234" — cámbiela de inmediato (o defina ADMIN_INICIAL_PASSWORD antes del primer arranque).')
  );
}
