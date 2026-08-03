# Plan de Pruebas

## 1. Estrategia

| Nivel | Herramienta | Alcance | Ubicación |
|---|---|---|---|
| Unitarias | Vitest | Dominio puro: períodos, producto cartesiano, reglas de fecha límite, motor de reglas, tipos de dato, estados de seguimiento, validador de atributos | `tests/unit` |
| Integración | Vitest | Infraestructura real (DuckDB + Parquet) contra directorio temporal: repositorios, particionamiento, restauración, export analítico, configuración portable | `tests/integration` |
| Aceptación (E2E) | Playwright + Electron | La aplicación real de punta a punta: crear lista → indicador → capturar → seguimiento → verificación del Parquet en disco | `tests/acceptance` |
| Rendimiento | Vitest/manual | Ver §4 | roadmap |

Comandos: `npm test` (unit+integración), `npm run test:e2e` (aceptación; requiere display o `xvfb-run`).

## 2. Cobertura actual (71 pruebas)

**Unitarias (53)** — el corazón de negocio:

- `GeneradorPeriodos`: 12 meses/4 trimestres/2 semestres…, etiquetas, bisiestos, períodos disponibles vs. cerrados, `Personalizada` → `NoImplementadoError`.
- `ProductoCartesiano`: solo General sin desagregaciones; 2×3×2+1 combinaciones; exclusión temporal sin mutar configuración; elementos inactivos; canonicidad de claves.
- Reglas de fecha límite: día fijo (con ajuste a meses cortos), 1er lunes/2do martes, último viernes, primer/último día hábil, N días antes del cierre, error claro ante regla desconocida, extensión OCP.
- Motor de reglas: los 4 ejemplos de la especificación, composiciones and/or/not anidadas, between/contains/matches/isEmpty, errores de aridad/operador, registro de operadores nuevos.
- TypeRegistry: los 19 tipos, parseo (símbolos %, $, comas; booleanos en español; HH:MM), límites Int16/32/64, validaciones declarativas.
- `CalculadoraEstados`: NoAplica (período abierto/indicador inactivo), Pendiente, EnProgreso, Vencido, Completo (exige fecha de corte), período pendiente.
- `ValidadorAtributos`: obligatorio vacío, visibilidad condicional (no valida ocultos), obligatoriedad condicional, delegación al tipo.

**Integración (11)**:

- Creación de la estructura del Data Lake; CRUD con round-trip fiel; listas jerárquicas; upsert idempotente por clave natural; particionamiento por año y **restauración completa desde Parquet** tras perder la base de trabajo; levantamientos (fecha de corte, exclusiones); auditoría con filtros; export analítico (desagregaciones como columnas, campos calculados, dimensiones, CSV opcional); configuración portable round-trip entre dos instancias; rechazo de versiones futuras.

**Aceptación (7)** — sobre el binario Electron real con datos en un directorio temporal:

- Arranque en Seguimiento; creación de lista con elementos; creación de indicador trimestral con desagregación; captura con navegación por teclado y autoguardado; fecha de corte; reflejo en Seguimiento; materialización del Parquet analítico en disco; alternancia de tema claro/oscuro.

## 3. Casos de borde cubiertos y por ampliar

Cubiertos: meses cortos en reglas de día fijo, años bisiestos, listas sin elementos, valores nulos en comparaciones del motor, pegado con `\r\n`, claves con caracteres especiales (escape SQL).

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
