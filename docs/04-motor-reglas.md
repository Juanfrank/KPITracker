# Motor Declarativo de Reglas de Negocio

Las reglas condicionales **no se codifican**: se declaran como datos (AST JSON) y las evalúa un motor genérico (`src/domain/rules/`). Esto cumple el requisito de que la configuración nunca dependa del código.

## 1. El AST de condiciones

Una condición es un árbol de operadores cuyos operandos son referencias a atributos, literales u otras condiciones:

```ts
type Operando = { attr: string } | { literal: string|number|boolean|null } | Condicion;
interface Condicion { op: string; args: Operando[] }
```

Ejemplos de la especificación:

| Regla | AST |
|---|---|
| Mostrar atributo únicamente si `Estado = Activo` | `{ "op": "eq", "args": [{ "attr": "Estado" }, { "literal": "Activo" }] }` |
| Obligatorio únicamente si `Monto > 5000` | `{ "op": "gt", "args": [{ "attr": "Monto" }, { "literal": 5000 }] }` |
| `FechaFinal` debe ser mayor que `FechaInicio` | `{ "op": "gt", "args": [{ "attr": "FechaFinal" }, { "attr": "FechaInicio" }] }` |
| `Monto` debe ser menor que `Presupuesto` | `{ "op": "lt", "args": [{ "attr": "Monto" }, { "attr": "Presupuesto" }] }` |
| Compuesta | `{ "op": "and", "args": [ {...}, { "op": "or", "args": [ {...}, {...} ] } ] }` |

## 2. Operadores

Registro extensible (`EvaluadorReglas.registrarOperador`); base incluida:

`eq, ne, gt, gte, lt, lte, between, isEmpty, notEmpty, contains, matches (regex), and, or, not`

- Comparaciones numéricas cuando ambos operandos son números; lexicográficas en caso contrario (las fechas ISO `AAAA-MM-DD` comparan correctamente como texto).
- Comparar contra `null` produce `false` (nunca lanza).
- `and`/`or` son variádicos; el resto valida su aridad y falla con mensaje claro si el AST está malformado.
- **Agregar un operador nuevo no modifica el evaluador** (OCP); ver test `permite registrar operadores nuevos`.

## 3. Puntos de aplicación

| Tipo de regla | Entidad | Efecto | Dónde se evalúa |
|---|---|---|---|
| `Visibilidad` | `Indicador` | El atributo objetivo (`atributoObjetivoId`) se muestra solo si la condición es verdadera | `ValidadorAtributos.esVisible` — combina con AND la `condicionVisibilidad` propia del atributo (si existe) con las reglas de este tipo que lo referencian; un atributo oculto no se valida |
| `Obligatoriedad` | `Indicador` | El atributo objetivo es obligatorio solo si la condición es verdadera | `ValidadorAtributos.esObligatorio` — si el atributo define `condicionObligatorio` propia, esta tiene precedencia; si no, se usa la primera regla de este tipo que lo referencia (OR entre varias) |
| `ValidacionCruzada` | `Indicador` | La condición **debe cumplirse**; si no, se emite `mensajeError` y **no se persiste nada** (ni el indicador ni sus valores EAV) | `ServicioIndicadores.guardar` → `ValidadorAtributos.validarCruzadas(reglas, 'Indicador', contexto)` |
| `ValidacionCruzada` | `Recoleccion` | La condición se evalúa sobre los **agregados del levantamiento** (ver §3.1); el incumplimiento es siempre una **advertencia no bloqueante** | `ServicioRecoleccion` → `evaluarValidacionesCaptura` |

El contexto de evaluación (`ContextoEvaluacion`) resuelve atributos por nombre; el motor no sabe de dónde vienen los valores (formulario, EAV, campos fijos, agregados), lo que permite reutilizarlo en cualquier entidad. Para `Indicador`, `construirContextoIndicador` (dominio puro) expone los campos fijos (`Nombre, Definicion, Periodicidad, LineaBase, MetaGlobal, Estado, UnidadMedida, Responsable, Categoria`) y los atributos dinámicos por su `Atributo.nombre`; **es la misma función que ejecutan el backend (al guardar) y el renderer (validación en vivo)**, por lo que ambos evalúan exactamente igual.

### 3.1 Contexto de agregados en Recolección

Para reglas `ValidacionCruzada` de entidad `Recoleccion`, el contexto expone agregados calculados sobre las filas del levantamiento (`calcularAgregadosCaptura`): `General` (valor de la fila total), `Maximo`, `Minimo`, `Suma`, `Promedio` (de las desagregaciones, excluyendo la fila General), `CantidadConValor` y `TotalCombinaciones`. Existe además una advertencia integrada, sin necesidad de configurar nada: si `General < Maximo` de sus desagregaciones. Todas las advertencias de esta entidad son no bloqueantes: el autoguardado nunca se detiene por ellas.

## 4. Validaciones declarativas por atributo

Complementarias al motor, cada atributo declara una lista de validaciones (`ValidacionAtributo`):
`Obligatorio, LongitudMinima/Maxima, ValorMinimo/Maximo, FechaMinima/Maxima, ExpresionRegular, ValorUnico`.

La ejecución la delega `ValidadorAtributos` en el **descriptor del tipo de dato** (TypeRegistry), de modo que cada tipo aplica solo las validaciones que le competen.

## 5. UI de administración

El módulo **Reglas** ofrece dos editores sincronizados:

- **Constructor visual** (`EditorCondicion`, componente recursivo): para operadores de comparación muestra atributo–operador–valor (con toggle "comparar contra otro atributo"); para `and`/`or`/`not` renderiza los hijos anidados con controles para agregar, quitar y **envolver cualquier nodo** en un nuevo grupo Y/O (`envolverEnGrupo`), habilitando árboles de profundidad arbitraria construidos incrementalmente sin editar JSON. Los helpers estructurales (`agregarHijo`, `quitarHijo`, `reemplazarHijo`, `condicionVacia`) viven en el dominio (`src/domain/rules/constructorCondicion.ts`), puros y testeados.
- **Avanzado**: edición directa del AST JSON, como alternativa sincronizada para condiciones que el constructor visual no cubra.
- La tabla de reglas muestra una **descripción legible** de cada condición (`explicarCondicion`, dominio puro) en vez del JSON crudo.
- Un selector **"Se aplica sobre"** (Indicador | Recoleccion) determina el tipo de contexto disponible: atributos del indicador en el primer caso, agregados del levantamiento en el segundo (donde el tipo se fija automáticamente en `ValidacionCruzada`, único aplicable).

## 6. Extensiones previstas (roadmap)

- Funciones de fecha (`hoy()`, `finDePeriodo()`), aritmética (`suma`, `resta`) como operadores adicionales.
- Acciones derivadas (autocompletar un atributo cuando se cumple una condición).
- Sugerencias de valor por tipo en el constructor visual (selects de listas de selección, date pickers) según el `TypeRegistry` del atributo referenciado.
