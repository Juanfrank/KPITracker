# Roadmap de Escalabilidad

La arquitectura ya contempla estas incorporaciones sin rediseños importantes. Se listan con su punto de extensión previsto.

## Corto plazo

| Funcionalidad | Punto de extensión ya preparado |
|---|---|
| **Periodicidad personalizada** | `Periodicidad.Personalizada` existe en el modelo; implementar un `GeneradorPeriodos` configurable (definición de cortes por el usuario) y su UI. Hoy lanza `NoImplementadoError` controlado. |
| **Responsables por indicador** | Campo `Indicador.responsable` ya persiste y viaja en la configuración portable; falta catálogo de usuarios y filtro en Seguimiento (columna prevista). |
| **Categorías de indicadores** | Campo `Indicador.categoria` persistido; añadir lista de selección dedicada y filtro en el tablero. |
| **UI avanzada del motor de reglas** | El evaluador ya soporta `and/or/not` anidados; falta un constructor visual de árboles (hoy: editor simple + JSON). |
| **Validación cruzada en captura** | Motor listo; conectar reglas `ValidacionCruzada` a la grilla de recolección (p. ej. General ≥ máximo de desagregaciones). |

## Mediano plazo

| Funcionalidad | Estrategia |
|---|---|
| **Fórmulas automáticas / indicadores derivados y compuestos** | Nuevo tipo de indicador con expresión sobre otros indicadores; evaluar con DuckDB sobre `FactResultados`; el motor de operadores es la base del lenguaje de fórmulas. |
| **Flujos de revisión/aprobación** | `Levantamiento` es el agregado natural: añadir `estadoFlujo` + tabla de transiciones; la auditoría ya registra actor y momento. |
| **Comentarios y evidencias adjuntas** | Tabla `Adjuntos` (entidad, entidadId, ruta relativa en `/Data/Adjuntos`); `Resultado.observacion` ya existe como comentario simple. |
| **Versionado de resultados** | El upsert actual conserva `creadoEn/actualizadoEn` y la auditoría guarda valor anterior/nuevo; para versionado completo, convertir `resultados` en tabla append-only con `version` y vista del último valor. |
| **Notificaciones** | `CalculadoraEstados` ya produce vencimientos; añadir un programador local (al abrir la app) con notificaciones del sistema operativo. |

## Largo plazo

| Funcionalidad | Estrategia |
|---|---|
| **Multiusuario + sincronización opcional con servidor central** | Los puertos (`I*Repository`) permiten una implementación remota o híbrida (cola de cambios + resolución por `actualizadoEn`); los UUID evitan colisiones de ids; la auditoría ya registra `usuario`. |
| **Internacionalización (i18n)** | Los textos de la UI están en componentes por módulo; extraerlos a `renderer/i18n/es.ts` como diccionario y parametrizar `toLocaleString`. |
| **Aprobadores y seguridad por rol** | Sobre el catálogo de usuarios: roles por módulo (captura, configuración, administración). |
| **Regeneración incremental del export** | Si el volumen supera ~10⁶ resultados: particionar `ResultadosAnalitico` por año y regenerar solo particiones sucias (el contrato de lectura no cambia). |
| **Nuevos tipos de dato** | Registrar `TypeDescriptor` adicionales (p. ej. GeoPoint, Rango) — cero cambios en el núcleo. |
| **Nuevas reglas de fecha límite** | Registrar `DeadlineRule` adicionales (p. ej. calendario de feriados institucional). |
