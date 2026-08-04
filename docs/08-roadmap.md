# Roadmap de Escalabilidad

La arquitectura ya contempla estas incorporaciones sin rediseños importantes. Se listan con su punto de extensión previsto.

## Completado (iteración 2)

Todo el roadmap de corto plazo de la primera entrega quedó implementado:

| Funcionalidad | Estado |
|---|---|
| **Periodicidad personalizada** | Implementada: `DefinicionPeriodicidad` (cortes con validación de cobertura anual sin huecos ni solapes), CRUD en Configuración General, selector en Indicadores, generación de períodos en Recolección/Seguimiento/Export. |
| **Responsables por indicador** | Catálogo `Responsable` (CRUD en Administración), selector en Indicadores, columna y filtro en Seguimiento, nombre resuelto en el export analítico. |
| **Categorías de indicadores** | Catálogo `Categoria` (CRUD en Administración), selector en Indicadores, columna y filtro en Seguimiento, nombre resuelto en el export analítico. |
| **UI avanzada del motor de reglas** | Constructor visual (`EditorCondicion`) con condiciones anidadas Y/O/NO, agrupar cualquier nodo, comparación atributo↔literal/atributo; modo JSON avanzado se mantiene como alternativa. Tabla de reglas con descripción legible (`explicarCondicion`). |
| **Validación cruzada en captura** | Conectada: `ServicioRecoleccion` evalúa reglas `ValidacionCruzada` de entidad `Recoleccion` sobre agregados del levantamiento (General/Máximo/Mínimo/Suma/Promedio/CantidadConValor/TotalCombinaciones); advertencia por defecto (General < máximo) más reglas configurables; siempre no bloqueante. |
| **Reglas de Visibilidad/Obligatoriedad aplicadas** | El formulario de Indicadores evalúa en vivo (mismo dominio puro que el backend) la visibilidad y obligatoriedad de cada atributo dinámico, combinando la condición propia del atributo con las reglas del módulo Reglas que lo referencian. |
| **Validación cruzada al guardar indicadores** | `ServicioIndicadores.guardar` valida atributos y reglas `ValidacionCruzada` de entidad `Indicador` **antes** de persistir; si falla, no se escribe nada (indicador ni valores EAV). |

## Corto plazo (siguiente iteración)

| Funcionalidad | Punto de extensión previsto |
|---|---|
| **Constructor visual: sugerencias de valor por tipo** | `EditorCondicion` hoy trata todo literal como texto/número; podría consultar el `TypeRegistry` del atributo referenciado para ofrecer selects de listas de selección o date pickers en el operando. |
| **Metas con periodicidad personalizada** | `Meta.periodicidadMedicion` no admite aún `Personalizada`; agregar `metaPeriodicidadPersonalizadaId` siguiendo el mismo patrón que `Indicador`. |
| **Reasignación masiva de responsable/categoría** | Acción por lote desde Seguimiento (seleccionar varios indicadores y asignar). |

## Mediano plazo

| Funcionalidad | Estrategia |
|---|---|
| **Fórmulas automáticas / indicadores derivados y compuestos** | Nuevo tipo de indicador con expresión sobre otros indicadores; evaluar con DuckDB sobre `FactResultados`; el motor de operadores (ya extensible) es la base del lenguaje de fórmulas. |
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
| **Desambiguación de `periodo_id` entre definiciones personalizadas** | Hoy dos `DefinicionPeriodicidad` distintas pueden producir el mismo `periodo_id` (`AAAA-Personalizada-NN`) si comparten año y número de corte; sin ambigüedad práctica porque el grano de los hechos incluye `indicador_id`, pero si se requiere una `DimPeriodo` sin colisiones, prefijar el id con la definición. |
