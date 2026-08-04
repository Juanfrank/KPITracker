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
| **Notificaciones de vencimientos** | Función pura `indicadoresQueRequierenNotificacion` (vencidos y próximos a vencer) + integración en el proceso main con `Notification` de Electron cada hora, deduplicada en memoria por sesión. |

Items previos de la iteración 2 (periodicidad personalizada base, catálogos, motor de reglas, validación cruzada) también completados — ver historial de este documento.

## Mediano plazo (pendiente)

| Funcionalidad | Estrategia |
|---|---|
| **Flujos de revisión/aprobación** | Excluido deliberadamente de esta iteración. `Levantamiento` es el agregado natural: añadir `estadoFlujo` + tabla de transiciones; la auditoría ya registra actor y momento. |

## Largo plazo

| Funcionalidad | Estrategia |
|---|---|
| **Multiusuario + sincronización opcional con servidor central** | Los puertos (`I*Repository`) permiten una implementación remota o híbrida (cola de cambios + resolución por `actualizadoEn`); los UUID evitan colisiones de ids; la auditoría ya registra `usuario`. |
| **Internacionalización (i18n)** | Los textos de la UI están en componentes por módulo; extraerlos a `renderer/i18n/es.ts` como diccionario y parametrizar `toLocaleString`. |
| **Aprobadores y seguridad por rol** | Sobre el catálogo de usuarios: roles por módulo (captura, configuración, administración). |
| **Regeneración incremental del export** | Si el volumen supera ~10⁶ resultados: particionar `ResultadosAnalitico` por año y regenerar solo particiones sucias (el contrato de lectura no cambia). |
| **Nuevos tipos de dato** | Registrar `TypeDescriptor` adicionales (p. ej. GeoPoint, Rango) — cero cambios en el núcleo. |
| **Nuevas reglas de fecha límite** | Registrar `DeadlineRule` adicionales (p. ej. calendario de feriados institucional). |
| **Desambiguación de `periodo_id` entre definiciones personalizadas** | Hoy dos `DefinicionPeriodicidad` distintas pueden producir el mismo `periodo_id` (`AAAA-Personalizada-NN`) si comparten año y número de corte; sin ambigüedad práctica porque el grano de los hechos incluye `indicador_id`, pero si se requiere una `DimPeriodo` sin colisiones, prefijar el id con la definición. |
