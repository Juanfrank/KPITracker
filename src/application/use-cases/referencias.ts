import type {
  IAliasDesagregacionOrigenRepository,
  IAtributoRepository,
  IAutomatizacionIndicadorRepository,
  IIndicadorRepository,
  IReglaRepository,
  IResponsableRepository,
  IUsuarioRepository
} from '@application/ports/index';

/**
 * Verificación de referencias antes de un borrado lógico (Batch M): cada
 * función recorre las colecciones que podrían apuntar al id dado y devuelve
 * una lista de descripciones legibles ("Indicador: X") — vacía si nada lo
 * referencia, en cuyo caso el servicio invocante procede con el borrado.
 *
 * Las columnas JSON serializadas (`desagregaciones`, `mapeoColumnas`,
 * `parametrosDinamicos`) se filtran en memoria tras `listar()`/`listarTodas()`
 * — nunca con `LIKE` sobre el texto serializado (misma convención que la
 * validación cruzada de `ServicioIndicadores.guardar`). Solo se consideran
 * usos activos (no eliminados): un ítem ya en borrado lógico no bloquea a
 * otro.
 */

export interface DepsReferenciasLista {
  indicadores: IIndicadorRepository;
  atributos: IAtributoRepository;
  aliasDesagregacionOrigen: IAliasDesagregacionOrigenRepository;
  automatizaciones: IAutomatizacionIndicadorRepository;
}

export async function referenciasDeLista(deps: DepsReferenciasLista, listaId: string): Promise<string[]> {
  const detalles: string[] = [];

  const indicadores = await deps.indicadores.listar();
  for (const indicador of indicadores) {
    if (indicador.desagregaciones.includes(listaId)) detalles.push(`Indicador: ${indicador.nombre}`);
  }

  const atributos = await deps.atributos.listar();
  for (const atributo of atributos) {
    if (atributo.listaId === listaId) detalles.push(`Atributo: ${atributo.nombre}`);
  }

  const alias = await deps.aliasDesagregacionOrigen.listarPorLista(listaId);
  if (alias.length > 0) detalles.push(`Alias de desagregación (${alias.length})`);

  const indicadorPorId = new Map(indicadores.map((i) => [i.id, i.nombre]));
  const automatizaciones = await deps.automatizaciones.listarTodas();
  for (const auto of automatizaciones) {
    if (auto.mapeoColumnas.some((m) => m.listaId === listaId)) {
      detalles.push(`Automatización del indicador: ${indicadorPorId.get(auto.indicadorId) ?? auto.indicadorId}`);
    }
  }

  return detalles;
}

export interface DepsReferenciasAtributo {
  reglas: IReglaRepository;
  automatizaciones: IAutomatizacionIndicadorRepository;
  atributos: IAtributoRepository;
  indicadores: IIndicadorRepository;
}

export async function referenciasDeAtributo(deps: DepsReferenciasAtributo, atributoId: string): Promise<string[]> {
  const detalles: string[] = [];

  const reglas = await deps.reglas.listar();
  for (const regla of reglas) {
    if (regla.atributoObjetivoId === atributoId) detalles.push(`Regla: ${regla.nombre}`);
  }

  const indicadores = await deps.indicadores.listar();
  const indicadorPorId = new Map(indicadores.map((i) => [i.id, i.nombre]));
  const automatizaciones = await deps.automatizaciones.listarTodas();
  for (const auto of automatizaciones) {
    if (auto.parametrosDinamicos.some((p) => p.atributoId === atributoId)) {
      detalles.push(`Automatización del indicador: ${indicadorPorId.get(auto.indicadorId) ?? auto.indicadorId}`);
    }
  }

  const valores = await deps.atributos.listarEntidadesConValor(atributoId);
  for (const valor of valores) {
    if (valor.entidadTipo !== 'Indicador') continue;
    const nombre = indicadorPorId.get(valor.entidadId) ?? valor.entidadId;
    detalles.push(`Indicador con valor capturado: ${nombre}`);
  }

  return detalles;
}

/**
 * Ninguna colección del código base referencia el id de una regla de
 * negocio (verificado): el borrado lógico se implementa igual por
 * consistencia/reversibilidad, pero el bloqueo en la práctica nunca se
 * dispara.
 */
export function referenciasDeRegla(): Promise<string[]> {
  return Promise.resolve([]);
}

export interface DepsReferenciasIndicadorCatalogo {
  indicadores: IIndicadorRepository;
}

export async function referenciasDeResponsable(deps: DepsReferenciasIndicadorCatalogo, responsableId: string): Promise<string[]> {
  const indicadores = await deps.indicadores.listar();
  return indicadores.filter((i) => i.responsable === responsableId).map((i) => `Indicador: ${i.nombre}`);
}

export async function referenciasDeCategoria(deps: DepsReferenciasIndicadorCatalogo, categoriaId: string): Promise<string[]> {
  const indicadores = await deps.indicadores.listar();
  return indicadores.filter((i) => i.categoria === categoriaId).map((i) => `Indicador: ${i.nombre}`);
}

export interface DepsReferenciasEquipo {
  responsables: IResponsableRepository;
  indicadores: IIndicadorRepository;
}

/** Bloquea el borrado de un equipo referenciado directo (`Indicador.equipo`) o indirecto (vía `Responsable.equipoId`). */
export async function referenciasDeEquipo(deps: DepsReferenciasEquipo, equipoId: string): Promise<string[]> {
  const detalles: string[] = [];

  const responsables = await deps.responsables.listar();
  for (const responsable of responsables) {
    if (responsable.equipoId === equipoId) detalles.push(`Responsable: ${responsable.nombre}`);
  }

  const indicadores = await deps.indicadores.listar();
  for (const indicador of indicadores) {
    if (indicador.equipo === equipoId) detalles.push(`Indicador: ${indicador.nombre}`);
  }

  return detalles;
}

export interface DepsReferenciasRol {
  usuarios: IUsuarioRepository;
}

/** Bloquea el borrado de un rol referenciado por algún usuario (`rolGeneralId` o `rolEquipoId`). */
export async function referenciasDeRol(deps: DepsReferenciasRol, rolId: string): Promise<string[]> {
  const usuarios = await deps.usuarios.listar();
  return usuarios
    .filter((u) => u.rolGeneralId === rolId || u.rolEquipoId === rolId)
    .map((u) => `Usuario: ${u.nombreCompleto || u.nombreUsuario}`);
}

export interface DepsReferenciasOrigen {
  automatizaciones: IAutomatizacionIndicadorRepository;
  aliasDesagregacionOrigen: IAliasDesagregacionOrigenRepository;
  indicadores: IIndicadorRepository;
}

export async function referenciasDeOrigen(deps: DepsReferenciasOrigen, origenId: string): Promise<string[]> {
  const detalles: string[] = [];

  const indicadores = await deps.indicadores.listar();
  const indicadorPorId = new Map(indicadores.map((i) => [i.id, i.nombre]));
  const automatizaciones = await deps.automatizaciones.listarTodas();
  for (const auto of automatizaciones) {
    if (auto.origenAutomaticoId === origenId) {
      detalles.push(`Automatización del indicador: ${indicadorPorId.get(auto.indicadorId) ?? auto.indicadorId}`);
    }
  }

  const alias = await deps.aliasDesagregacionOrigen.listarPorOrigen(origenId);
  if (alias.length > 0) detalles.push(`Alias de desagregación (${alias.length})`);

  return detalles;
}
