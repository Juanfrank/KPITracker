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

| Tipo de regla | Efecto | Dónde se evalúa |
|---|---|---|
| `Visibilidad` | El atributo objetivo se muestra solo si la condición es verdadera | `ValidadorAtributos.esVisible` (un atributo oculto no se valida) |
| `Obligatoriedad` | El atributo objetivo es obligatorio solo si la condición es verdadera | `ValidadorAtributos.esObligatorio` |
| `ValidacionCruzada` | La condición **debe cumplirse**; si no, se emite `mensajeError` | Validación al guardar la entidad |

El contexto de evaluación (`ContextoEvaluacion`) resuelve atributos por nombre; el motor no sabe de dónde vienen los valores (formulario, EAV, campos fijos), lo que permite reutilizarlo en cualquier entidad futura.

## 4. Validaciones declarativas por atributo

Complementarias al motor, cada atributo declara una lista de validaciones (`ValidacionAtributo`):
`Obligatorio, LongitudMinima/Maxima, ValorMinimo/Maximo, FechaMinima/Maxima, ExpresionRegular, ValorUnico`.

La ejecución la delega `ValidadorAtributos` en el **descriptor del tipo de dato** (TypeRegistry), de modo que cada tipo aplica solo las validaciones que le competen.

## 5. UI de administración

El módulo **Reglas** ofrece dos editores sincronizados:

- **Simple**: atributo — operador — valor (o comparación contra otro atributo). Cubre la gran mayoría de reglas reales.
- **Avanzado**: edición directa del AST JSON, para condiciones anidadas con `and/or/not`.

## 6. Extensiones previstas (roadmap)

- Funciones de fecha (`hoy()`, `finDePeriodo()`), aritmética (`suma`, `resta`) como operadores adicionales.
- Reglas a nivel de recolección (p. ej. "el valor General no puede ser menor que el máximo de sus desagregaciones").
- Acciones derivadas (autocompletar un atributo cuando se cumple una condición).
