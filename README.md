# KPITracker

Aplicación de escritorio **100% local (offline-first)** para la configuración, recolección periódica, seguimiento y exportación analítica de indicadores institucionales.

- **Sin servidores ni motores de base de datos externos**: DuckDB embebido + Data Lake local en Apache Parquet.
- **Todo configurable desde la aplicación**: indicadores, atributos dinámicos, listas de selección (incl. jerárquicas), desagregaciones multinivel, metas, reglas de negocio declarativas y reglas de fecha límite.
- **Exportación automática para Power BI**: capa desnormalizada siempre sincronizada (Parquet y CSV opcional).
- **Arquitectura preparada para crecer**: Clean Architecture, DDD táctico, MVVM, Repository Pattern e inyección de dependencias explícita.

## Inicio rápido

```bash
npm install        # instala dependencias (incluye Electron)
npx electron-builder install-app-deps  # recompila módulos nativos (better-sqlite3) contra el ABI de Electron — una sola vez, ver nota abajo
npm run dev        # ejecuta la aplicación de escritorio en modo desarrollo
npm run build      # compila la app de escritorio para producción
npm run dev:server # servidor web (Express + tRPC) en modo desarrollo, con recarga — ver "Servidor web" abajo
npm run start:server # servidor web, sin recarga (equivalente a producción)
npm test           # pruebas unitarias + integración (Vitest)
npm run test:e2e   # pruebas de aceptación (Playwright sobre Electron)
npm run typecheck  # verificación de tipos
npm run lint       # linter
```

> **Nota — módulos nativos y Electron**: la persistencia ahora usa Knex sobre
> `better-sqlite3` (local) o `mssql` (producción, ver más abajo). `better-sqlite3`
> es un binding nativo compilado contra el ABI de Node — el de Electron es
> distinto del de Node "normal", así que tras `npm install` hace falta
> `npx electron-builder install-app-deps` (una sola vez, requiere acceso de red
> normal a `electronjs.org` para descargar los headers) antes de `npm run dev`/
> `npm run test:e2e`. `npm test` (Vitest, sin Electron) no lo necesita —
> corre sobre Node directamente y ya usa el binario tal cual se instaló.
> Este paso desaparece por completo en la Fase 4 del plan de migración a app
> web (retiro de Electron a favor de un servidor Node/Express normal).

Los datos viven en `Data/` dentro del directorio de usuario de la aplicación (`userData`), con esta estructura:

```
/Data
  /Config       Indicadores, Atributos, Reglas, Listas, ElementosLista, Metas (Parquet)
  /Dimensions   DimIndicador, DimPeriodo, DimFecha, DimDesagregacion, ... (Parquet)
  /Facts        FactResultados (particionado por año), FactSeguimiento, FactValoresAtributos
  /Logs         Auditoria.parquet
  /Export       ResultadosAnalitico.parquet (+ .csv opcional)  ← conectar Power BI aquí
  Configuracion.json
```

## Servidor web (Fase 3 de la migración a app web)

Además de la app de escritorio, `src/server/` levanta un servidor Express con
una API tRPC (`/api/trpc`) y unas pocas rutas REST planas para archivos
(`/api/adjuntos`, `/api/importacion`, `/api/respaldo`, `/api/portable` —
subida/descarga multipart, fuera de tRPC a propósito). Comparte capa de
dominio/aplicación/infraestructura con la app de escritorio; lo único que
cambia es el transporte y que ahora hay sesiones multi-usuario reales.

```bash
KPITRACKER_DATA_DIR=./data npm run dev:server   # http://localhost:3000
```

**Variables de entorno** (todas con default razonable para desarrollo local, salvo donde se indica):

| Variable | Uso | Default |
|---|---|---|
| `KPITRACKER_DATA_DIR` | Directorio de datos (adjuntos, exportación) | `./data` |
| `PORT` | Puerto HTTP | `3000` |
| `DB_CLIENT` | `better-sqlite3` (local, sin instalación) o `mssql` (producción) | `better-sqlite3` |
| `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Conexión SQL Server — **obligatorias** con `DB_CLIENT=mssql` | — |
| `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | Opciones TLS de la conexión SQL Server | `true` / `false` |
| `COOKIE_SECRET` | Firma de la cookie de sesión — **obligatoria en `NODE_ENV=production`** | valor fijo de desarrollo |
| `ADMIN_INICIAL_USUARIO`, `ADMIN_INICIAL_PASSWORD` | Credenciales del administrador creado automáticamente si `usuarios` está vacía en el primer arranque | `admin` / `admin1234` (¡cambiar de inmediato!) |

Apuntar `DB_CLIENT=mssql` a un servidor/base vacíos y arrancar el servidor
crea el esquema completo ahí solo (Knex, `knex.migrate.latest()` dentro de
`crearInstanciaKnex`) — no hace falta ningún paso manual de DBA.

**Autenticación**: usuario/contraseña (bcrypt) + sesión de servidor en una
cookie firmada (`httpOnly`, no un JWT autocontenido — revocar es borrar la
fila, ver `ServicioAutenticacion`). Preparado para reemplazarse por Azure AD
más adelante sin tocar sesiones/roles (`IAuthProvider`, hoy solo
`ProveedorPassword`). Dos roles: `admin` (gestión de usuarios + pantallas de
administración, `usuarios.*` y varios `*.eliminar`/`*.restaurar`) y `usuario`
(el resto). Todavía no hay frontend que consuma esta API (eso es la Fase 4);
se verifica con un cliente tRPC de Node — ver
`tests/integration/servidorTrpc.test.ts` y `servidorRest.test.ts`.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/01-arquitectura.md](docs/01-arquitectura.md) | Arquitectura, justificación tecnológica, diagrama de módulos, flujos de navegación |
| [docs/02-modelo-datos.md](docs/02-modelo-datos.md) | ERD, modelo dimensional (star schema), Data Lake Parquet, capa DuckDB |
| [docs/03-configuracion-portable.md](docs/03-configuracion-portable.md) | JSON versionado de configuración y estrategia de migración |
| [docs/04-motor-reglas.md](docs/04-motor-reglas.md) | Motor declarativo de reglas de negocio |
| [docs/05-especificacion-funcional.md](docs/05-especificacion-funcional.md) | Especificación funcional y wireframes de todos los módulos |
| [docs/06-exportacion-analitica.md](docs/06-exportacion-analitica.md) | Capa desnormalizada para Power BI y estrategia de sincronización |
| [docs/07-plan-pruebas.md](docs/07-plan-pruebas.md) | Plan de pruebas (unitarias, integración, rendimiento, aceptación) |
| [docs/08-roadmap.md](docs/08-roadmap.md) | Roadmap de escalabilidad |

## Estructura del código

```
src/
  domain/           Dominio puro (entidades, servicios, motor de reglas) — sin dependencias
  application/      Casos de uso y puertos (interfaces de repositorio)
  infrastructure/   Knex (SQLite local / SQL Server), auth, exportación, configuración portable
  composicion/      Cableado compartido de servicios de aplicación (usado por main/ Y server/)
  main/             Proceso principal de Electron (composition root + IPC)
  preload/          Puente seguro renderer ⇄ main
  server/           Servidor Express + tRPC (multi-usuario, ver "Servidor web" arriba)
  renderer/         Interfaz React (MVVM con stores Zustand) — app de escritorio, Electron
  shared/           Contrato IPC tipado (app de escritorio)
tests/
  unit/ integration/ acceptance/
```
