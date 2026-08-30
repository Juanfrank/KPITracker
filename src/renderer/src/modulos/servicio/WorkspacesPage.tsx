import { Encabezado } from '../../componentes/basicos';
import { SeccionWorkspaces } from './SeccionWorkspaces';

/** `Servicio > Administración > Workspaces` (Batch AX) — ver docstring de `SeccionWorkspaces`. */
export function WorkspacesPage(): React.JSX.Element {
  return (
    <>
      <Encabezado
        titulo="Workspaces"
        descripcion="Espacios de trabajo aislados — cada uno con su propio catálogo de roles."
      />
      <SeccionWorkspaces />
    </>
  );
}
