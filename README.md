# KPITracker

Aplicación **web multi-usuario** para la configuración, recolección periódica, seguimiento y exportación analítica de indicadores institucionales.

- **Multi-usuario con autenticación real**: usuario/contraseña (bcrypt) + sesión de servidor, preparada para reemplazarse por Azure AD sin tocar el andamiaje de sesiones/roles.
- **Doble backend de base de datos**: SQLite local (sin instalación, ideal para desarrollo/pruebas) o SQL Server en producción, ambos vía Knex — `knex migrate:latest` crea el esquema completo desde cero apuntando a un SQL Server vacío.
- **Todo configurable desde la aplicación**: indicadores, atributos dinámicos, listas de selección (incl. jerárquicas), desagregaciones multinivel, metas, reglas de negocio declarativas y reglas de fecha límite.
- **Exportación automática para Power BI**: capa desnormalizada siempre sincronizada (Parquet y CSV opcional).
- **Arquitectura preparada para crecer**: Clean Architecture, DDD táctico, MVVM, Repository Pattern e inyección de dependencias explícita.

## Inicio rápido

El servidor (Express + tRPC + API REST de archivos) y el frontend (SPA de React
servida por Vite) son dos procesos en desarrollo; en producción el servidor
sirve el build de la SPA desde el mismo puerto.

```bash
npm install                                   # instala dependencias

# Terminal 1 — servidor (API + datos)
KPITRACKER_DATA_DIR=./data npm run dev:server # http://localhost:3000

# Terminal 2 — frontend (SPA con recarga en caliente)
npm run dev                                   # http://localhost:5173, proxya /api al puerto 3000

npm run build          # compila la SPA a out/renderer/ (build de producción)
npm run start:server   # servidor de producción — sirve la API y, si existe, out/renderer/ (un solo puerto)

npm test               # pruebas unitarias + integración (Vitest)
npm run test:e2e       # pruebas de aceptación (Playwright, servidor + SPA reales)
npm run typecheck      # verificación de tipos
npm run lint           # linter
```

Al primer arranque del servidor, si la tabla `usuarios` está vacía se crea
automáticamente un administrador inicial (ver `ADMIN_INICIAL_USUARIO`/
`ADMIN_INICIAL_PASSWORD` más abajo) — con eso ya se puede iniciar sesión.

## Servidor y API

`src/server/` levanta un servidor Express con una API tRPC (`/api/trpc`) y
unas pocas rutas REST planas para archivos (`/api/adjuntos`,
`/api/importacion`, `/api/respaldo`, `/api/portable` — subida/descarga
multipart, fuera de tRPC a propósito). En producción, el mismo servidor sirve
además el build estático de la SPA (`out/renderer/`, generado por
`npm run build`) desde el mismo puerto, con fallback a `index.html` para las
rutas de cliente.

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
(el resto). El frontend consume esta API con un cliente tRPC vanilla
(`src/renderer/src/trpc.ts`) más un pequeño helper REST para archivos
(`src/renderer/src/rest.ts`).

**Brechas conocidas, no resueltas en silencio** (documentadas como trabajo
futuro, no descartadas):
- El inicio de sesión interactivo de Microsoft para orígenes XMLA/Power BI
  (`AutenticadorMicrosoft`) requería una ventana nativa de Electron; en la
  versión web no hay equivalente todavía y el intento falla con un error
  explícito — falta implementar un flujo de redirección OAuth del lado del
  servidor.
- El almacenamiento del refresh token de ese mismo flujo usa siempre el
  formato de respaldo en texto plano (antes se intentaba cifrar con el
  llavero del sistema operativo vía Electron `safeStorage`).
- Las notificaciones de vencimientos son un banner descartable calculado al
  visitar Seguimiento, no el aviso nativo por hora que había en la app de
  escritorio; un mecanismo proactivo real (cron del lado del servidor +
  email/webhook) queda pendiente.

## Datos y exportación analítica

Los archivos generados por la aplicación (adjuntos subidos, exportación
analítica para Power BI) viven en `KPITRACKER_DATA_DIR`:

```
/Data
  /Export       ResultadosAnalitico.parquet (+ .csv opcional)  ← conectar Power BI aquí
  /Adjuntos     Archivos subidos como evidencia de resultados
```

La configuración e indicadores en sí ya no viven en archivos Parquet — se
persisten en la base de datos relacional (SQLite local o SQL Server) vía
Knex; DuckDB se conserva acotado exclusivamente al trabajo de exportación
analítica descrito arriba.

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
  composicion/      Composition root — cablea aplicación + infraestructura, mapa de manejadores por canal
  server/           Servidor Express + tRPC (API multi-usuario, rutas REST de archivos, servido de la SPA)
  renderer/         Interfaz React (MVVM con stores Zustand) — SPA servida por Vite
    src/auth/         Sesión de cliente (AuthContext, LoginPage) y rutas protegidas
    src/trpc.ts        Cliente tRPC vanilla
    src/rest.ts        Helper de subida/descarga de archivos (fuera de tRPC)
  shared/           Contrato tipado de canales (usado por composicion/ y por el cliente tRPC del renderer)
tests/
  unit/ integration/ acceptance/
```
