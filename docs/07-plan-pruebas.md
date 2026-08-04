# Plan de Pruebas

## 1. Estrategia

| Nivel | Herramienta | Alcance | Ubicación |
|---|---|---|---|
| Unitarias | Vitest | Dominio puro: períodos (incl. personalizados), producto cartesiano, reglas de fecha límite, motor de reglas y constructor visual, tipos de dato, estados de seguimiento, validador de atributos, agregados/validación de captura, contexto de reglas del indicador | `tests/unit` |
| Integración | Vitest | Infraestructura real (DuckDB + Parquet) contra directorio temporal: repositorios, particionamiento, restauración, export analítico, configuración portable; y composition root completo (casos de uso end-to-end vía los manejadores IPC) | `tests/integration` |
| Aceptación (E2E) | Playwright + Electron | La aplicación real de punta a punta: dos specs — flujo base y flujo de la iteración 2 (periodicidad personalizada, reglas, filtros) | `tests/acceptance` |
| Rendimiento | Vitest/manual | Ver §4 | roadmap |

Comandos: `npm test` (unit+integración), `npm run test:e2e` (aceptación; requiere display o `xvfb-run`).

## 2. Cobertura actual (138 pruebas)

**Unitarias (105)** — el corazón de negocio:

- `GeneradorPeriodos`: 12 meses/4 trimestres/2 semestres…, etiquetas, bisiestos, períodos disponibles vs. cerrados, periodicidad `Personalizada` (con y sin definición) generando períodos según los cortes.
- `DefinicionPeriodicidad`: `validarDefinicionPeriodicidad` — cobertura completa del año, huecos, solapes, numeración no consecutiva, meses fuera de rango, mes final anterior al inicial, caso límite de un único corte anual.
- `ProductoCartesiano`: solo General sin desagregaciones; 2×3×2+1 combinaciones; exclusión temporal sin mutar configuración; elementos inactivos; canonicidad de claves.
- Reglas de fecha límite: día fijo (con ajuste a meses cortos), 1er lunes/2do martes, último viernes, primer/último día hábil, N días antes del cierre, error claro ante regla desconocida, extensión OCP.
- Motor de reglas (`EvaluadorReglas`): los 4 ejemplos de la especificación, composiciones and/or/not anidadas, between/contains/matches/isEmpty, errores de aridad/operador, registro de operadores nuevos.
- `explicarCondicion`: traducción a frase legible de comparaciones simples, comparaciones entre atributos, and/or/not, anidamiento de tres niveles, operador desconocido.
- `constructorCondicion`: helpers estructurales del editor visual — envolver en grupo, agregar/quitar/reemplazar hijo, extracción de atributos referenciados, `esOperadorLogico`.
- `ValidacionCaptura`: `calcularAgregadosCaptura` (General/Máximo/Mínimo/Suma/Promedio/CantidadConValor/TotalCombinaciones) y `evaluarValidacionesCaptura` (advertencia integrada, reglas activas/inactivas, filtrado por entidad).
- `contextoIndicador`: resolución de campos fijos por nombre, atributos dinámicos, valores ausentes, serialización de MultiSelectionList, precedencia de un atributo dinámico sobre un campo fijo homónimo.
- TypeRegistry: los 19 tipos, parseo (símbolos %, $, comas; booleanos en español; HH:MM), límites Int16/32/64, validaciones declarativas.
- `CalculadoraEstados`: NoAplica (período abierto/indicador inactivo), Pendiente, EnProgreso, Vencido, Completo (exige fecha de corte), período pendiente.
- `ValidadorAtributos`: obligatorio vacío, visibilidad/obligatoriedad condicional propias del atributo, combinación con reglas `ReglaNegocio` de tipo Visibilidad/Obligatoriedad (AND entre ambos mecanismos, reglas inactivas o de otro atributo ignoradas), `validarCruzadas` filtrando por entidad.

**Integración (20)**:

- *Infraestructura* (11): creación de la estructura del Data Lake; CRUD con round-trip fiel; listas jerárquicas; upsert idempotente por clave natural; particionamiento por año y **restauración completa desde Parquet** tras perder la base de trabajo; levantamientos (fecha de corte, exclusiones); auditoría con filtros; export analítico (desagregaciones como columnas, campos calculados, dimensiones, CSV opcional); configuración portable round-trip entre dos instancias; rechazo de versiones futuras.
- *Composition root* (9, `tests/integration/aplicacion.test.ts`): guardar un indicador que incumple una regla `ValidacionCruzada` se rechaza con el `mensajeError` configurado y **no persiste nada** (ni el indicador ni sus valores EAV); CRUD de periodicidades/responsables/categorías vía IPC; rechazo de una definición de periodicidad con huecos; periodicidad personalizada de punta a punta (definición → indicador → períodos → captura); advertencia de validación cruzada visible tanto en la respuesta de guardar celda como en la captura recargada; migración real de un archivo portable v1 (sin las secciones nuevas) a v2; el export analítico resuelve nombre de responsable/categoría en vez del id técnico.

**Aceptación (13)** — sobre el binario Electron real con datos en un directorio temporal:

- *Flujo base* (7): arranque en Seguimiento; creación de lista con elementos; creación de indicador trimestral con desagregación; captura con navegación por teclado y autoguardado; fecha de corte; reflejo en Seguimiento; materialización del Parquet analítico en disco; alternancia de tema claro/oscuro.
- *Iteración 2* (6, `iteracion2.spec.ts`): definición de periodicidad personalizada con dos semestres; creación de un responsable; indicador con esa periodicidad y responsable asignado; captura en el período generado por la definición; filtro por responsable en Seguimiento; creación de una regla de validación cruzada con el constructor visual.

## 3. Casos de borde cubiertos y por ampliar

Cubiertos: meses cortos en reglas de día fijo, años bisiestos, listas sin elementos, valores nulos en comparaciones del motor, pegado con `\r\n`, claves con caracteres especiales (escape SQL), huecos/solapes en definiciones de periodicidad personalizada, migración real de un archivo portable v1 auténtico (sin las secciones agregadas en v2).

Por ampliar (backlog): pegado desde Excel en E2E (restricciones de clipboard en CI), deshacer/rehacer en E2E, importación de archivo portable corrupto en UI, bloqueo del archivo Parquet por un lector externo durante la regeneración.

## 4. Pruebas de rendimiento (diseño)

Objetivos sobre hardware de oficina:

| Escenario | Métrica objetivo |
|---|---|
| Captura: guardar celda (repositorio + auditoría) | < 50 ms percibidos |
| Producto cartesiano 5×32×12 (~1 900 filas) | render < 500 ms |
| Regeneración del export con 100 000 resultados | < 5 s |
| Arranque con restauración completa desde Parquet | < 3 s |

Método: fixture generadora de datos sintéticos (indicadores × períodos × desagregaciones) + `performance.now()` en pruebas de integración etiquetadas `@rendimiento` (excluidas del run normal).

## 5. Criterios de aceptación de una versión

1. `npm run typecheck`, `npm run lint`, `npm test` y `npm run test:e2e` en verde.
2. Ninguna escritura sin registro de auditoría.
3. El export analítico refleja cualquier edición en ≤ 2 s (debounce incluido).
4. La aplicación arranca sin red y sin dependencias instaladas por fuera del paquete.
