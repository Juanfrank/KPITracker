# Roadmap de Escalabilidad

La arquitectura ya contempla estas incorporaciones sin rediseños importantes. Se listan con su punto de extensión previsto.

## Completado (iteración 3)

Todo el roadmap de corto plazo y la mayor parte del de mediano plazo (excepto flujos de revisión/aprobación, que queda pendiente deliberadamente) quedaron implementados, junto con varias funcionalidades adicionales solicitadas fuera del roadmap:

| Funcionalidad | Estado |
|---|---|
| **Constructor visual: sugerencias de valor por tipo** | `EditorCondicion` resuelve el `TypeRegistry` del atributo referenciado en el lado izquierdo y ofrece `<select>` (listas de selección), date picker o Sí/No según `editorHint`, en vez de un input de texto plano. |
| **Metas con periodicidad personalizada** | `Meta.periodicidadPersonalizadaId`, con el mismo patrón de validación que `Indicador`; selector condicional en el formulario de metas. |
| **Reasignación masiva de responsable/categoría** | Selección múltiple en Seguimiento (checkboxes + "seleccionar todos") con barra de acción para asignar/quitar responsable o categoría en lote (`ServicioIndicadores.reasignarMasivo`). |
| **Importación de indicadores desde Excel** | Selector de archivo nativo + lectura de `.xlsx`/`.csv` (ExcelJS) + mapeo de columnas a campos → creación en lote con reporte de errores por fila sin bloquear el resto. |
| **Código de indicador** | `Indicador.codigo`: string único visible (validado al guardar, no obligatorio para no romper indicadores existentes), columna en la tabla y en el export analítico. |
| **Línea base con período** | `Indicador.lineaBasePeriodoId`: selector de período junto al valor de línea base. |
| **Subtotal general en desagregaciones** | Confirmado y etiquetado explícitamente: `ProductoCartesiano` ya generaba una fila `GENERAL` transitiva al dato sin sub-desagregación; ahora se muestra como "Subtotal general" en la grilla de Recolección. |
| **Fórmulas automáticas / indicadores derivados** | `Indicador.esCalculado` + `formula` (expresión aritmética sobre códigos de otros indicadores entre corchetes, p. ej. `[IND-001] + [IND-002] * 0.5`); `EvaluadorFormulas` de dominio con detección de ciclos; cómputo a nivel GENERAL en la grilla de Recolección (solo lectura) y en el export analítico. |
| **Evidencias adjuntas** | Entidad `Adjunto` + tabla `adjuntos`; archivos copiados a `/Data/Adjuntos`; panel de adjuntos en el formulario de Indicadores (subir/abrir/eliminar). `Resultado.observacion` sigue cubriendo comentarios simples. |
| **Versionado de resultados + rollback** | Tabla append-only `resultados_historial`; cada escritura de celda registra el estado reemplazado; ícono de historial junto a "Última modificación" en Recolección, con restauración a una versión anterior (que a su vez preserva el estado reemplazado). |
| **Notificaciones de vencimientos** | Función pura `indicadoresQueRequierenNotificacion` (vencidos y próximos a vencer). Integración original: `Notification` nativa de Electron cada hora, deduplicada en memoria por sesión. Desde la migración a app web (Fase 4) es un banner descartable en Seguimiento, calculado al visitar la página contra el tablero ya cargado — un mecanismo proactivo real (cron del lado del servidor + email/webhook) queda pendiente, ver más abajo. |

Items previos de la iteración 2 (periodicidad personalizada base, catálogos, motor de reglas, validación cruzada) también completados — ver historial de este documento.

## Completado (migración a app web)

La aplicación pasó de escritorio 100% local (Electron + DuckDB embebido) a web multi-usuario (Express + tRPC + Knex), en cinco fases — ver `docs/01-arquitectura.md` y `docs/02-modelo-datos.md` para el diseño resultante:

| Funcionalidad | Estado |
|---|---|
| **Multiusuario + autenticación real** | Usuario/contraseña (bcrypt) + sesión de servidor en cookie firmada, revocable; dos roles (`admin`/`usuario`); punto de enganche (`IAuthProvider`) listo para un `ProveedorOidc` de Azure AD futuro sin tocar sesiones ni guards. |
| **Doble backend de base de datos** | Knex sobre `better-sqlite3` (local/pruebas, sin instalación) o `mssql` (producción); `knex migrate:latest` crea el esquema completo en un SQL Server vacío, sin paso manual de DBA. |
| **API tRPC + REST de archivos** | ~90 procedimientos tRPC (uno por acción existente) más rutas REST planas para adjuntos, importación de Excel, respaldo y configuración portable (multipart/streaming, fuera de tRPC a propósito). |
| **SPA web independiente** | React servido por Vite, con `react-router-dom` y rutas reales por módulo; login/logout, guard de sesión, página de administración de usuarios. |
| **Retiro de Electron** | `src/main/`, `src/preload/` y el toolchain de empaquetado se eliminaron por completo una vez verificada la SPA de punta a punta contra el servidor real. |
| **Exportación analítica reimplementada** | `ExportAnaliticoService` vuelve a escribir Parquet/CSV para Power BI, ahora leyendo desde Knex y usando DuckDB solo como motor de escritura en memoria, de vida corta (ya no es el almacén OLTP). |

Brechas conocidas de esta migración, documentadas y no resueltas en silencio (detalle en el README):

- Login interactivo de Microsoft para orígenes XMLA/Power BI (antes una ventana nativa de Electron) no tiene equivalente web todavía — falla con un error explícito hasta implementar un flujo de redirección OAuth del lado del servidor.
- El refresh token de ese mismo flujo se guarda siempre en el formato de respaldo en texto plano (antes se intentaba cifrar vía el llavero del sistema operativo).
- Las notificaciones de vencimientos pasaron de un aviso nativo por hora a un banner al visitar Seguimiento — ver la fila de la tabla de arriba.

## Mediano plazo (pendiente)

| Funcionalidad | Estrategia |
|---|---|
| **Flujos de revisión/aprobación** | Excluido deliberadamente de esta iteración. `Levantamiento` es el agregado natural: añadir `estadoFlujo` + tabla de transiciones; la auditoría ya registra actor y momento. |

## Largo plazo

| Funcionalidad | Estrategia |
|---|---|
| **`ProveedorOidc` (Azure AD / Entra ID)** | El punto de enganche (`IAuthProvider`) ya está listo — implementar el mapeo de claims OIDC a una fila de `usuarios` con aprovisionamiento just-in-time; sesiones, cookies y guards no cambian. |
| **Internacionalización (i18n)** | Los textos de la UI están en componentes por módulo; extraerlos a `renderer/i18n/es.ts` como diccionario y parametrizar `toLocaleString`. |
| **RBAC granular / aprobadores por módulo** | Hoy solo `admin`/`usuario` — una semilla deliberadamente mínima. Extender sobre el catálogo de usuarios: roles por módulo (captura, configuración, administración). |
| **Notificaciones de vencimientos proactivas** | Reemplazar el banner al visitar Seguimiento por un mecanismo real del lado del servidor (cron + email/webhook), o `Notification` del navegador con permiso explícito y polling. |
| **Regeneración incremental del export** | Si el volumen supera ~10⁶ resultados: particionar `ResultadosAnalitico` por año y regenerar solo particiones sucias (el contrato de lectura no cambia). |
| **Nuevos tipos de dato** | Registrar `TypeDescriptor` adicionales (p. ej. GeoPoint, Rango) — cero cambios en el núcleo. |
| **Nuevas reglas de fecha límite** | Registrar `DeadlineRule` adicionales (p. ej. calendario de feriados institucional). |
| **Desambiguación de `periodo_id` entre definiciones personalizadas** | Hoy dos `DefinicionPeriodicidad` distintas pueden producir el mismo `periodo_id` (`AAAA-Personalizada-NN`) si comparten año y número de corte; sin ambigüedad práctica porque el grano de los hechos incluye `indicador_id`, pero si se requiere una `DimPeriodo` sin colisiones, prefijar el id con la definición. |
