# KPITracker

Aplicación de escritorio **100% local (offline-first)** para la configuración, recolección periódica, seguimiento y exportación analítica de indicadores institucionales.

- **Sin servidores ni motores de base de datos externos**: DuckDB embebido + Data Lake local en Apache Parquet.
- **Todo configurable desde la aplicación**: indicadores, atributos dinámicos, listas de selección (incl. jerárquicas), desagregaciones multinivel, metas, reglas de negocio declarativas y reglas de fecha límite.
- **Exportación automática para Power BI**: capa desnormalizada siempre sincronizada (Parquet y CSV opcional).
- **Arquitectura preparada para crecer**: Clean Architecture, DDD táctico, MVVM, Repository Pattern e inyección de dependencias explícita.

## Inicio rápido

```bash
npm install        # instala dependencias (incluye Electron y DuckDB embebido)
npm run dev        # ejecuta la aplicación en modo desarrollo
npm run build      # compila para producción
npm test           # pruebas unitarias + integración (Vitest)
npm run test:e2e   # pruebas de aceptación (Playwright sobre Electron)
npm run typecheck  # verificación de tipos
npm run lint       # linter
```

Los datos viven en `Data/` dentro del directorio de usuario de la aplicación (`userData`), con esta estructura:

```
/Data
  /Config       Indicadores, Atributos, Reglas, Listas, ElementosLista, Metas (Parquet)
  /Dimensions   DimIndicador, DimPeriodo, DimFecha, DimDesagregacion, ... (Parquet)
  /Facts        FactResultados (particionado por año), FactSeguimiento, FactValoresAtributos
  /Logs         Auditoria.parquet
  /Export       ResultadosAnalitico.parquet (+ .csv opcional)  ← conectar Power BI aquí
  Configuracion.json
```

## Documentación

| Documento | Contenido |
|---|---|
| [docs/01-arquitectura.md](docs/01-arquitectura.md) | Arquitectura, justificación tecnológica, diagrama de módulos, flujos de navegación |
| [docs/02-modelo-datos.md](docs/02-modelo-datos.md) | ERD, modelo dimensional (star schema), Data Lake Parquet, capa DuckDB |
| [docs/03-configuracion-portable.md](docs/03-configuracion-portable.md) | JSON versionado de configuración y estrategia de migración |
| [docs/04-motor-reglas.md](docs/04-motor-reglas.md) | Motor declarativo de reglas de negocio |
| [docs/05-especificacion-funcional.md](docs/05-especificacion-funcional.md) | Especificación funcional y wireframes de todos los módulos |
| [docs/06-exportacion-analitica.md](docs/06-exportacion-analitica.md) | Capa desnormalizada para Power BI y estrategia de sincronización |
| [docs/07-plan-pruebas.md](docs/07-plan-pruebas.md) | Plan de pruebas (unitarias, integración, rendimiento, aceptación) |
| [docs/08-roadmap.md](docs/08-roadmap.md) | Roadmap de escalabilidad |

## Estructura del código

```
src/
  domain/           Dominio puro (entidades, servicios, motor de reglas) — sin dependencias
  application/      Casos de uso y puertos (interfaces de repositorio)
  infrastructure/   DuckDB, Parquet, exportación, configuración portable
  main/             Proceso principal de Electron (composition root + IPC)
  preload/          Puente seguro renderer ⇄ main
  renderer/         Interfaz React (MVVM con stores Zustand)
  shared/           Contrato IPC tipado
tests/
  unit/ integration/ acceptance/
```
