# Configuración Portable (JSON versionado)

> **Batch X (X9)**: la tarjeta "Configuración portable" de Administración se retiró — duplicaba exactamente lo que ya ofrece "Respaldo e importación" (`docs/09-despliegue.md` §6), que además cubre resultados capturados y borrados lógicos. El mecanismo descrito en este documento (`/api/portable/exportar`/`/api/portable/importar`, `ConfigPortableService`) sigue existiendo en el servidor — solo dejó de tener una pantalla propia en la SPA.

Toda la configuración se exporta e importa mediante **un único archivo JSON versionado**. Incluye: parámetros generales, indicadores (con sus desagregaciones), atributos, listas y elementos, reglas, metas, periodicidades personalizadas y catálogos (responsables/categorías).

## 1. Estructura del archivo (schemaVersion 2)

```jsonc
{
  "formato": "kpitracker-config",     // discriminador del tipo de archivo
  "schemaVersion": 2,                 // versión del esquema (migraciones)
  "exportadoEn": "2026-08-04T12:00:00.000Z",
  "configuracionGeneral": {
    "anioInicial": 2025,
    "reglaFechaLimite": { "tipo": "DiaFijoDelMes", "parametros": { "dia": 10 } },
    "exportarCsv": false,
    "nombreInstitucion": "…",
    "tema": "sistema",
    "schemaVersion": 2
  },
  "indicadores": [
    {
      "id": "…", "nombre": "Tasa de resolución de casos",
      "definicion": "…", "periodicidad": "Trimestral", "periodicidadPersonalizadaId": null,
      "lineaBase": 60, "metaGlobal": 90,
      "desagregaciones": ["<listaId Sexo>", "<listaId Provincia>"],
      "estado": "Activo", "responsable": "<responsableId>", "categoria": "<categoriaId>",
      "unidadMedida": "%", "creadoEn": "…", "actualizadoEn": "…"
    }
  ],
  "atributos":      [ { "id": "…", "tipoDato": "Percentage", "validaciones": [], "condicionVisibilidad": null, "...": "…" } ],
  "listas":         [ { "id": "…", "nombre": "Sexo", "jerarquica": false, "version": 3, "...": "…" } ],
  "elementos":      [ { "id": "…", "listaId": "…", "codigo": "M", "padreCodigo": null, "...": "…" } ],
  "reglas":         [ { "id": "…", "entidad": "Indicador", "tipo": "Obligatoriedad", "condicion": { "op": "gt", "args": [ { "attr": "Monto" }, { "literal": 5000 } ] } } ],
  "metas":          [ { "id": "…", "indicadorId": "…", "claveDesagregacion": "GENERAL", "metodoCalculo": "Promedio" } ],
  "periodicidades": [ { "id": "…", "nombre": "Semestres personalizados", "cortes": [ { "numero": 1, "etiqueta": "Primer semestre", "mesInicio": 1, "mesFin": 6 }, { "numero": 2, "etiqueta": "Segundo semestre", "mesInicio": 7, "mesFin": 12 } ] } ],
  "responsables":   [ { "id": "…", "nombre": "Ana Martínez", "correo": "ana@example.org", "activo": true } ],
  "categorias":     [ { "id": "…", "nombre": "Estratégico", "descripcion": "…", "activo": true } ]
}
```

La estructura completa está validada con **Zod** (`src/infrastructure/config-portable/ConfigPortableService.ts`); un archivo malformado se rechaza con un error claro antes de tocar los datos.

## 2. Semántica de la importación

- La importación hace **upsert por id**: crea lo que no existe y actualiza lo que existe.
- No elimina entidades ausentes en el archivo (importación aditiva, más segura). Una futura opción "reemplazo total" queda en el roadmap.
- Los **resultados levantados no forman parte** de la configuración portable: son datos operativos y viajan con el Data Lake (`/Data/Facts`).
- Toda importación queda registrada en Auditoría.

## 3. Estrategia de versionado y migración

`schemaVersion` es un entero que se incrementa con cada cambio de estructura. Las migraciones son **pasos encadenables v(n) → v(n+1)**:

```ts
const migraciones: Record<number, (a: ArchivoConfig) => ArchivoConfig> = {
  1: (a) => ({
    ...a, schemaVersion: 2,
    periodicidades: a.periodicidades ?? [], responsables: a.responsables ?? [], categorias: a.categorias ?? []
  }),
  2: (a) => ({ ...a, schemaVersion: 3, /* transformación */ })
};
```

La migración **1 → 2** (ya implementada) es la primera migración real del sistema: agrega las secciones `periodicidades`, `responsables` y `categorias`. En el esquema de parseo (Zod) estas tres claves son opcionales, de modo que un archivo v1 auténtico —que no las trae— se lea sin error; es la función de migración la que las completa con arreglos vacíos al subir a v2. Aunque el cambio es aditivo (y por la regla de abajo no habría exigido subir de versión), se optó por versionar explícitamente para que un archivo v2 sea siempre un contrato completo y autodescriptivo, y para validar de punta a punta el mecanismo de migración.

Al importar:

1. Si `schemaVersion` **>** versión de la app → se rechaza (el archivo es de una versión más nueva).
2. Si es **menor**, se aplican las migraciones en cadena hasta la versión actual, informando cada paso como advertencia.
3. Si falta un paso de migración → error explícito (nunca se importa a medias).

Reglas para evolucionar el esquema:

- **Agregar campos opcionales** no requiere subir de versión (los valores por defecto los completan).
- **Renombrar/mover/retipar** campos sí requiere versión nueva + paso de migración.
- Los pasos de migración existentes **jamás se modifican** (solo se agregan), garantizando que cualquier archivo histórico siga siendo importable.
