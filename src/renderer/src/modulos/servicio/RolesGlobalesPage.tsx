import { Encabezado } from '../../componentes/basicos';
import { SeccionRolesGlobales } from './SeccionRolesGlobales';

/** `Servicio > Administración > Roles globales` (Batch AX) — ver docstring de `SeccionRolesGlobales`. */
export function RolesGlobalesPage(): React.JSX.Element {
  return (
    <>
      <Encabezado
        titulo="Roles globales"
        descripcion="Permisos sobre los workspaces mismos (crear, administrar, eliminar, cambiar entre ellos) — no lo que hay dentro de uno."
      />
      <SeccionRolesGlobales />
    </>
  );
}
