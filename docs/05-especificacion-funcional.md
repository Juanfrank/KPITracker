# Especificación Funcional y UX/UI por Módulo

Convenciones globales de UX: navegación por teclado, autoguardado (sin botón Guardar en la captura), validaciones inmediatas, paneles laterales para edición, filtros instantáneos, búsqueda global (Ctrl+K), temas claro/oscuro y layout responsive de escritorio (mínimo 1024×700).

---

## 1. Seguimiento (pantalla inicial)

**Propósito**: visión inmediata del cumplimiento de los levantamientos.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Seguimiento                                                            │
│ [Todos] [Pendientes (3)] [En progreso (1)] [Vencidos (2)] [Completados]│
│ [Periodicidad ▾]                                   [Buscar indicador…] │
├────────────────────────────────────────────────────────────────────────┤
│ Indicador     Estado       Period.  Período pend. F.límite F.corte ... │
│ Tasa resol.   ● Vencido    Trimest. T1 2026      2026-04-10  —    ▂▄▆ │
│ Casos nuevos  ● Pendiente  Mensual  Julio 2026   2026-08-10  —    ▂▄▆ │
└────────────────────────────────────────────────────────────────────────┘
   clic en fila → panel lateral con el detalle por período → "Ir a la captura"
```

- Columnas: Nombre, Estado, Periodicidad, Responsable, Categoría, Período pendiente, Fecha límite, Fecha de corte, Progreso (períodos completos/total), Última actualización.
- **Estados** (`Pendiente / En progreso / Completo / Vencido / No aplica`) calculados dinámicamente por `CalculadoraEstados`: fecha actual + regla de fecha límite + periodicidad + resultados registrados + fecha de corte. Nunca un booleano persistido.
- Filtros: por estado (chips con contador), periodicidad, **responsable**, **categoría** (ambos como select derivado de los catálogos y de los indicadores presentes en el tablero), texto.
- Un período está **Completo** solo si todas sus combinaciones tienen valor **y** existe fecha de corte.

## 2. Recolección

**Propósito**: captura productiva de resultados por período.

```
┌────────────────────────────────────────────────────────────────────────┐
│ [Indicador ▾]  [Período ▾]  [Fecha de corte 📅]                        │
│ Desagregaciones: (✓ Sexo) (✓ Provincia) (✕ Tribunal ← excluida)        │
├────────────────────────────────────────────────────────────────────────┤
│ Sexo      Provincia   │ Resultado — T2 2026 │ Última modificación      │
│ ► General (total)     │            [ 82.5 ] │ 03/08/2026 14:02         │
│ Masculino Santo Dgo.  │            [ 80   ] │ …                        │
│ Femenino  Santo Dgo.  │            [ 85   ] │ …                        │
└────────────────────────────────────────────────────────────────────────┘
  Enter/↑↓ navegar · Ctrl+V pegar desde Excel · Ctrl+Z/Ctrl+Y · autoguardado
```

- Los **períodos disponibles** derivan de la periodicidad del indicador y del año inicial global (períodos ya iniciados; por defecto se selecciona el último cerrado).
- Las filas forman un **cubo** (como SQL `CUBE` / DAX `SUMMARIZECOLUMNS` con `ROLLUPADDISSUBTOTAL`): la fila **General** (todas las desagregaciones enrolladas, siempre presente porque el total puede no ser un promedio simple), un **subtotal** por cada subconjunto de desagregaciones presentes (el resto enrolladas, mostradas como "Todos" y en cursiva), y el **detalle completo** (producto cartesiano de todas). Para N desagregaciones, cada una aporta un factor de (1 + su cantidad de elementos activos) al total de filas.
- **Exclusión temporal**: chips de desagregación por levantamiento; al excluir, la grilla se regenera sin esa lista. No modifica el indicador.
- **Fecha de corte**: única, obligatoria para completar el período, compartida por todas las desagregaciones.
- Captura: edición rápida en celda; Enter o ↓/↑ confirman y navegan; pegado multi-fila desde Excel (TSV); validación en tiempo real (celda roja + tooltip con el error); indicadores visuales guardando/guardada; deshacer/rehacer con pila de cambios; autoguardado por celda (sin botón Guardar). El historial de cada celda queda en Auditoría.
- **Advertencias de validación cruzada**: tras cada guardado se recalculan y muestran en un banner no bloqueante (nunca detienen el autoguardado). Incluyen una advertencia integrada por defecto —el resultado General es menor que el máximo de sus desagregaciones— más cualquier regla `ValidacionCruzada` configurada sobre la entidad `Recoleccion` (evaluada sobre agregados: General, Máximo, Mínimo, Suma, Promedio, CantidadConValor, TotalCombinaciones).

## 3. Configuración de Indicadores

- Tabla con filtro por texto; panel lateral de edición.
- Atributos mínimos obligatorios: **Nombre, Definición, Periodicidad, Línea base, Meta, Desagregaciones** (+ Estado, Unidad de medida). Validación al guardar con mensajes por campo.
- Periodicidades: Mensual, Bimestral, Trimestral, Cuatrimestral, Semestral, Anual, **Personalizada** (al seleccionarla aparece un selector de la `DefinicionPeriodicidad` a usar, administradas en Configuración General).
- **Responsable** y **Categoría**: selectores sobre los catálogos administrados en Administración (opcionales).
- **Desagregaciones por checkbox** sobre las listas activas.
- **Metas**: alta/edición/baja por indicador; cada meta define valor, año de vigencia, desagregación (clave), periodicidad de medición y método de cálculo (Promedio, Sumatoria, Último valor, Máximo, Mínimo — registro extensible).
- **Atributos adicionales**: los atributos dinámicos activos y visibles se renderizan en el panel con el editor adecuado a su tipo de dato (`CampoAtributo`), y se persisten vía EAV como parte del mismo guardado del indicador (transaccional a nivel de caso de uso: si la validación falla, no se escribe nada).
- **Validación en vivo**: visibilidad, obligatoriedad y validaciones de cada atributo dinámico se evalúan mientras se edita, con el mismo motor de reglas (dominio puro) que ejecutará el backend al guardar — nunca hay sorpresas entre lo que se ve y lo que se valida al enviar.
- **Reglas `ValidacionCruzada`** (entidad Indicador) se evalúan al guardar; si alguna falla, se muestra su `mensajeError` y no se persiste el indicador ni sus atributos.

## 4. Configuración de Atributos

- Los atributos NO son fijos: crear, modificar, eliminar, **reordenar** (▲▼ dentro del grupo), **agrupar** (campo Grupo con autocompletado), **ocultar** (Visible), marcar **obligatorios**.
- Metadatos: nombre, descripción, grupo, orden, visible, editable, obligatorio, valor por defecto, tipo de dato, lista asociada (para tipos de selección), validaciones.
- 19 tipos de dato (ShortText…MultiSelectionList) provistos por el TypeRegistry; **agregar un tipo nuevo no toca el núcleo**.
- Validaciones múltiples por atributo (ver doc. del motor de reglas).

## 5. Listas de Selección

- Vista maestro-detalle: listas a la izquierda, elementos a la derecha con edición en línea.
- Lista: nombre, descripción, estado, **versión** (se incrementa automáticamente al modificar), orden, jerárquica.
- Elemento: código, descripción, orden, **padre** (solo listas jerárquicas), activo.
- Las listas jerárquicas modelan estructuras multinivel (País → Provincia → Municipio → …) y alimentan las desagregaciones.

## 6. Reglas de Negocio

- **Constructor visual** (`EditorCondicion`): atributo–operador–valor con toggle "comparar contra otro atributo"; para condiciones compuestas, agrupar cualquier nodo con Y/O, agregar/quitar hijos, negar con NO — sin editar JSON. **Avanzado**: edición directa del AST JSON como alternativa sincronizada.
- Selector **"Se aplica sobre"**: `Indicador` (atributos del formulario) o `Recoleccion` (agregados del levantamiento); en este último caso el tipo se fija automáticamente en Validación cruzada.
- Tipos: Visibilidad, Obligatoriedad (ambos con atributo objetivo, solo sobre Indicador), Validación cruzada (con mensaje de error configurable, sobre Indicador o Recoleccion).
- La tabla de reglas muestra una descripción legible de la condición en vez del JSON crudo.

## 7. Configuración General

- **Año inicial** (desde cuándo pueden levantarse resultados).
- **Fecha límite de llenado**: selector de regla + parámetros generados dinámicamente desde los metadatos de la regla (día fijo, N-ésimo día de semana, último día de semana, primer/último día hábil, N días antes del cierre; nuevas reglas se registran sin tocar la UI).
- Exportar CSV además de Parquet; nombre de la institución. Autoguardado con indicador de estado.
- **Periodicidades personalizadas**: CRUD de `DefinicionPeriodicidad` — nombre, descripción y una lista de cortes (etiqueta + mes de inicio/fin), con validación en vivo de que cubran el año completo sin huecos ni solapes. Usadas por los indicadores con periodicidad Personalizada.

## 8. Exportación

- Regeneración manual + explicación de la sincronización automática.
- Ruta de `ResultadosAnalitico.parquet` y guía paso a paso de conexión desde Power BI.

## 9. Auditoría

- Tabla con filtros por entidad y rango de fechas: fecha/hora, usuario, acción, entidad, campo, valor anterior, valor nuevo.

## 10. Administración

- **Configuración portable**: exportar (descarga JSON versionado) / importar (con migración automática de versiones antiguas).
- **Catálogos**: CRUD de Responsables (nombre, correo, activo) y Categorías (nombre, descripción, activo), asignables a indicadores y usados como filtro en Seguimiento.
- Nota sobre usuarios: un único usuario local en esta versión; multiusuario en el roadmap.
