import { Encabezado } from '../../componentes/basicos';
import { SeccionWorkspaces } from './SeccionWorkspaces';

/**
 * `Servicio > Administración > Workspaces` (Batch AX) — ver docstring de
 * `SeccionWorkspaces`. La descripción es deliberadamente literal ("con su
 * propio catálogo de roles", nada más) para no sugerir un aislamiento de
 * datos entre workspaces que hoy no existe (audit de seguridad, LOW-3) —
 * ver también la nota explícita en `CambiarWorkspacePage`.
 */
export function WorkspacesPage(): React.JSX.Element {
  return (
    <>
      <Encabezado
        titulo="Workspaces"
        descripcion="Cada workspace tiene su propio catálogo de roles. No aíslan indicadores, resultados ni otros datos — esos son compartidos por todos los workspaces."
      />
      <SeccionWorkspaces />
    </>
  );
}
