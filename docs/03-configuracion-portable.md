# Configuración Portable (JSON versionado)

Toda la configuración se exporta e importa mediante **un único archivo JSON versionado** desde el módulo Administración. Incluye: parámetros generales, indicadores (con sus desagregaciones), atributos, listas y elementos, reglas y metas.

## 1. Estructura del archivo

```jsonc
{
  "formato": "kpitracker-config",     // discriminador del tipo de archivo
  "schemaVersion": 1,                 // versión del esquema (migraciones)
  "exportadoEn": "2026-08-03T12:00:00.000Z",
  "configuracionGeneral": {
    "anioInicial": 2025,
    "reglaFechaLimite": { "tipo": "DiaFijoDelMes", "parametros": { "dia": 10 } },
    "exportarCsv": false,
    "nombreInstitucion": "…",
    "tema": "sistema",
    "schemaVersion": 1
  },
  "indicadores": [
    {
      "id": "…", "nombre": "Tasa de resolución de casos",
      "definicion": "…", "periodicidad": "Trimestral",
      "lineaBase": 60, "metaGlobal": 90,
      "desagregaciones": ["<listaId Sexo>", "<listaId Provincia>"],
      "estado": "Activo", "responsable": null, "categoria": null,
      "unidadMedida": "%", "creadoEn": "…", "actualizadoEn": "…"
    }
  ],
  "atributos":  [ { "id": "…", "tipoDato": "Percentage", "validaciones": [], "condicionVisibilidad": null, "...": "…" } ],
  "listas":     [ { "id": "…", "nombre": "Sexo", "jerarquica": false, "version": 3, "...": "…" } ],
  "elementos":  [ { "id": "…", "listaId": "…", "codigo": "M", "padreCodigo": null, "...": "…" } ],
  "reglas":     [ { "id": "…", "tipo": "Obligatoriedad", "condicion": { "op": "gt", "args": [ { "attr": "Monto" }, { "literal": 5000 } ] } } ],
  "metas":      [ { "id": "…", "indicadorId": "…", "claveDesagregacion": "GENERAL", "metodoCalculo": "Promedio" } ]
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
  1: (a) => ({ ...a, schemaVersion: 2, /* transformación */ }),
  2: (a) => ({ ...a, schemaVersion: 3, /* transformación */ })
};
```

Al importar:

1. Si `schemaVersion` **>** versión de la app → se rechaza (el archivo es de una versión más nueva).
2. Si es **menor**, se aplican las migraciones en cadena hasta la versión actual, informando cada paso como advertencia.
3. Si falta un paso de migración → error explícito (nunca se importa a medias).

Reglas para evolucionar el esquema:

- **Agregar campos opcionales** no requiere subir de versión (los valores por defecto los completan).
- **Renombrar/mover/retipar** campos sí requiere versión nueva + paso de migración.
- Los pasos de migración existentes **jamás se modifican** (solo se agregan), garantizando que cualquier archivo histórico siga siendo importable.
