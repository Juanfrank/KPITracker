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

- Columnas: Nombre, Estado, Periodicidad, Período pendiente, Fecha límite, Fecha de corte, Progreso (períodos completos/total), Última actualización. `Responsable` está en el modelo (arquitectura preparada) y se añadirá como columna cuando exista el flujo.
- **Estados** (`Pendiente / En progreso / Completo / Vencido / No aplica`) calculados dinámicamente por `CalculadoraEstados`: fecha actual + regla de fecha límite + periodicidad + resultados registrados + fecha de corte. Nunca un booleano persistido.
- Filtros: por estado (chips con contador), periodicidad, texto. Por responsable/categoría: arquitectura preparada.
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
- Las filas son el **producto cartesiano** de las desagregaciones activas **+ la fila General** (siempre presente, porque el total puede no ser un promedio simple de las desagregaciones).
- **Exclusión temporal**: chips de desagregación por levantamiento; al excluir, la grilla se regenera sin esa lista. No modifica el indicador.
- **Fecha de corte**: única, obligatoria para completar el período, compartida por todas las desagregaciones.
- Captura: edición rápida en celda; Enter o ↓/↑ confirman y navegan; pegado multi-fila desde Excel (TSV); validación en tiempo real (celda roja + tooltip con el error); indicadores visuales guardando/guardada; deshacer/rehacer con pila de cambios; autoguardado por celda (sin botón Guardar). El historial de cada celda queda en Auditoría.

## 3. Configuración de Indicadores

- Tabla con filtro por texto; panel lateral de edición.
- Atributos mínimos obligatorios: **Nombre, Definición, Periodicidad, Línea base, Meta, Desagregaciones** (+ Estado, Unidad de medida). Validación al guardar con mensajes por campo.
- Periodicidades: Mensual, Bimestral, Trimestral, Cuatrimestral, Semestral, Anual (Personalizada: preparada en el modelo, sin UI).
- **Desagregaciones por checkbox** sobre las listas activas.
- **Metas**: alta/edición/baja por indicador; cada meta define valor, año de vigencia, desagregación (clave), periodicidad de medición y método de cálculo (Promedio, Sumatoria, Último valor, Máximo, Mínimo — registro extensible).
- **Atributos adicionales**: los atributos dinámicos activos y visibles se renderizan en el panel y se persisten vía EAV.

## 4. Configuración de Atributos

- Los atributos NO son fijos: crear, modificar, eliminar, **reordenar** (▲▼ dentro del grupo), **agrupar** (campo Grupo con autocompletado), **ocultar** (Visible), marcar **obligatorios**.
- Metadatos: nombre, descripción, grupo, orden, visible, editable, obligatorio, valor por defecto, tipo de dato, lista asociada (para tipos de selección), validaciones.
- 19 tipos de dato (ShortText…MultiSelectionList) provistos por el TypeRegistry; **agregar un tipo nuevo no toca el núcleo**.
- Validaciones múltiples por atributo (ver doc. del motor de reglas).

## 5. Listas de Selección

- Vista maestro-detalle: listas a la izquierda, elementos a la derecha con edición en línea.
- Lista: nombre, descripción, estado, **versión** (se incrementa automáticamente al modificar), orden, jerárquica.
- Elemento: código, descripción, orden, **padre** (solo listas jerárquicas), activo.
- Las listas jerárquicas modelan África multinivel (País → Provincia → Municipio → …) y alimentan las desagregaciones.

## 6. Reglas de Negocio

- Editor simple (atributo-operador-valor / comparación entre atributos) y avanzado (AST JSON).
- Tipos: Visibilidad, Obligatoriedad, Validación cruzada (con mensaje de error configurable).

## 7. Configuración General

- **Año inicial** (desde cuándo pueden levantarse resultados).
- **Fecha límite de llenado**: selector de regla + parámetros generados dinámicamente desde los metadatos de la regla (día fijo, N-ésimo día de semana, último día de semana, primer/último día hábil, N días antes del cierre; nuevas reglas se registran sin tocar la UI).
- Exportar CSV además de Parquet; nombre de la institución. Autoguardado con indicador de estado.

## 8. Exportación

- Regeneración manual + explicación de la sincronización automática.
- Ruta de `ResultadosAnalitico.parquet` y guía paso a paso de conexión desde Power BI.

## 9. Auditoría

- Tabla con filtros por entidad y rango de fechas: fecha/hora, usuario, acción, entidad, campo, valor anterior, valor nuevo.

## 10. Administración

- **Configuración portable**: exportar (descarga JSON versionado) / importar (con migración automática de versiones antiguas).
- Nota sobre usuarios/responsables: un único usuario local en esta versión; multiusuario en el roadmap.
