# Despliegue

KPITracker es un único proceso Node (Express + tRPC) que, en producción, sirve además el build estático de la SPA — un solo puerto, un solo proceso a correr y supervisar. Este documento cubre variables de entorno, el runbook de primer arranque contra SQL Server, y notas operativas de respaldo/monitoreo.

## 1. Arquitectura de despliegue

```
┌─────────────────────────────┐        ┌──────────────────────┐
│  Node (src/server/index.ts) │  TDS   │  SQL Server           │
│  Express + tRPC + REST      │◄──────►│  (o SQLite en disco   │
│  sirve out/renderer/ (SPA)  │        │   si DB_CLIENT=       │
└─────────────────────────────┘        │   better-sqlite3)     │
         ▲                             └──────────────────────┘
         │ HTTPS (terminado por un reverse proxy delante, p. ej.
         │ IIS/nginx — la app en sí no hace TLS)
         │
     navegador
```

No hay build separado por entorno: las diferencias entre desarrollo/pruebas y producción son enteramente variables de entorno (`DB_CLIENT` y las credenciales de conexión).

## 2. Build de producción

```bash
npm ci                 # instala dependencias exactas (usa package-lock.json)
npm run build           # compila la SPA a out/renderer/
npm run start:server    # arranca el servidor (sirve la API y, si existe, out/renderer/)
```

`npm run start:server` es `tsx src/server/index.ts` — no hay paso de compilación TypeScript→JS aparte para el servidor; `tsx` lo ejecuta directo. Un proceso supervisor (systemd, pm2, IIS con iisnode, un contenedor con `restart: always`, etc.) debe mantenerlo vivo y reiniciarlo ante caídas — la propia app no hace daemonización.

## 3. Variables de entorno

| Variable | Obligatoria | Uso | Default |
|---|---|---|---|
| `PORT` | no | Puerto HTTP que escucha el servidor | `3000` |
| `KPITRACKER_DATA_DIR` | no | Directorio para adjuntos subidos y la exportación analítica (Parquet/CSV); también donde vive `kpitracker.sqlite` si `DB_CLIENT=better-sqlite3` | `./data` |
| `DB_CLIENT` | no | `better-sqlite3` (local, sin instalación) o `mssql` (producción) | `better-sqlite3` |
| `DB_SERVER` | **sí, con `DB_CLIENT=mssql`** | Host del servidor SQL Server (puerto por defecto del driver `mssql`; no hay variable separada para un puerto no estándar hoy) | — |
| `DB_NAME` | **sí, con `DB_CLIENT=mssql`** | Base de datos objetivo — puede estar vacía, `migrate:latest` la puebla | — |
| `DB_USER` | **sí, con `DB_CLIENT=mssql`** | Usuario SQL con permisos para crear/alterar tablas en `DB_NAME` | — |
| `DB_PASSWORD` | **sí, con `DB_CLIENT=mssql`** | Contraseña de `DB_USER` | — |
| `DB_ENCRYPT` | no | `true`/`false` — cifrado TLS de la conexión a SQL Server | `true` |
| `DB_TRUST_SERVER_CERTIFICATE` | no | `true`/`false` — aceptar un certificado no validado por una CA reconocida (útil solo para instancias internas con certificado autofirmado) | `false` |
| `COOKIE_SECRET` | **sí, en `NODE_ENV=production`** | Clave de firma de la cookie de sesión — un valor largo y aleatorio, distinto por instalación | valor fijo de desarrollo (rechazado explícitamente si `NODE_ENV=production` y no se definió) |
| `ADMIN_INICIAL_USUARIO` | no | Usuario del administrador creado automáticamente si la tabla `usuarios` está vacía en el primer arranque | `admin` |
| `ADMIN_INICIAL_PASSWORD` | no | Contraseña de ese administrador — **cambiarla de inmediato tras el primer login** si se dejó el default | `admin1234` |
| `NODE_ENV` | no | `production` activa las validaciones de variables obligatorias arriba marcadas | — |

No hay variable para TLS/HTTPS de la app en sí: en producción se espera un reverse proxy (IIS, nginx, un balanceador de carga) delante que termine TLS y reenvíe HTTP plano al puerto de `PORT`.

## 4. Runbook — primera instalación apuntando a SQL Server

1. Aprovisionar (o pedir a quien administre SQL Server) una base de datos vacía y un login con permisos de `db_ddladmin`/`db_datawriter`/`db_datareader` sobre ella — no hace falta ningún script de esquema previo.
2. Definir las variables de entorno del servidor: `DB_CLIENT=mssql`, `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, y un `COOKIE_SECRET` propio (generar uno nuevo, no reusar el de desarrollo — p. ej. `openssl rand -hex 32`).
3. Opcionalmente, definir `ADMIN_INICIAL_USUARIO`/`ADMIN_INICIAL_PASSWORD` con una contraseña fuerte elegida de antemano (si se omite, queda el default documentado arriba y **debe cambiarse en el primer login**).
4. `npm ci && npm run build`.
5. Arrancar el proceso (`npm run start:server`, bajo el supervisor que corresponda). En este primer arranque:
   - Knex corre `migrate.latest()` y crea las ~20 tablas del esquema completo en `DB_NAME` (indicadores, listas, resultados, usuarios, sesiones, etc.) — sin ningún paso manual de DBA más allá de tener la base vacía y el login con permisos.
   - Si la tabla `usuarios` queda vacía tras la migración, se siembra el administrador inicial automáticamente (log: `No había usuarios — se creó el administrador inicial "<usuario>"`).
6. Verificar que el proceso quedó escuchando en `PORT` y que el reverse proxy lo alcanza.
7. Iniciar sesión con el administrador inicial y, desde Administración → Usuarios, crear las cuentas reales y (si se usó la contraseña default) cambiarla de inmediato.
8. Confirmar que `KPITRACKER_DATA_DIR` es un directorio persistente entre reinicios/despliegues (no un directorio efímero del contenedor) — ahí viven los adjuntos subidos y la exportación analítica que consume Power BI.

Corridas posteriores del proceso son idempotentes: `migrate.latest()` no vuelve a aplicar migraciones ya aplicadas, y el sembrado de administrador solo ocurre si `usuarios` sigue vacía.

## 5. Runbook — actualizar una instalación existente

1. Desplegar el código nuevo (`git pull` / build de CI / imagen nueva del contenedor).
2. `npm ci && npm run build`.
3. Reiniciar el proceso del servidor. Si la nueva versión agrega migraciones, se aplican automáticamente al arrancar (`migrate.latest()`), antes de aceptar tráfico.
4. No hace falta ningún paso manual sobre SQL Server salvo que una migración puntual lo documente explícitamente en su propio changelog.

## 6. Respaldo y restauración

Dos mecanismos independientes, para necesidades distintas:

- **Respaldo/restauración completos** (Administración → Respaldo e importación): exporta un JSON con todo el estado configurable + operativo (indicadores, resultados, catálogos, etc.) desde la base activa, e importa selectivamente (por sección) a otra instancia — pensado para migrar entre `DB_CLIENT`s (p. ej. de SQLite local a SQL Server) o para copias de resguardo periódicas fuera de la base de datos misma.
- **Configuración portable** (`docs/03-configuracion-portable.md`, `/api/portable/*`): exporta/importa solo la configuración (indicadores, atributos, listas, reglas, metas — sin resultados capturados), versionado y con migración automática entre versiones del formato. Batch X (X9) retiró su tarjeta de Administración por ser un duplicado funcional de Respaldo — el mecanismo sigue disponible vía API para integraciones que solo necesiten configuración, sin datos operativos.

Además, la responsabilidad estándar de respaldo de la base de datos en sí (`DB_NAME` en SQL Server, o el archivo `kpitracker.sqlite` en `KPITRACKER_DATA_DIR` si es local) sigue las prácticas normales de backup del motor elegido — eso está fuera del alcance de la aplicación.

## 7. Monitoreo mínimo recomendado

- El proceso responde 200 en `GET /` (sirve la SPA) y en `GET /api/trpc/auth.yo` (siempre responde, con o sin sesión) — cualquiera de las dos sirve como *health check* básico.
- Vigilar el log de arranque por el mensaje de sembrado de administrador — si aparece en un arranque que no era el primero, algo borró la tabla `usuarios` y merece investigarse.
- El directorio de `KPITRACKER_DATA_DIR/Export` debe actualizarse tras cada escritura (con el debounce de ~1 s) — una fecha de modificación estancada en `ResultadosAnalitico.parquet` mientras hay actividad de captura es señal de que la regeneración está fallando (revisar el log del proceso, que la registra con `console.error`).
