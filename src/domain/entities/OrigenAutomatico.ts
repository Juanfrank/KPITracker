/** Tipo de conexión del origen automático de resultados. */
export type TipoOrigenAutomatico = 'XMLA' | 'SQL' | 'API';

/**
 * Origen de datos externo configurado para obtener resultados de forma
 * automática (plataforma preparada; la ejecución real de la consulta se
 * habilita en una versión posterior). `configuracion` guarda pares
 * clave/valor específicos del tipo (credenciales, cadena de conexión,
 * endpoint, etc.).
 */
export interface OrigenAutomatico {
  readonly id: string;
  nombre: string;
  tipo: TipoOrigenAutomatico;
  descripcion: string;
  configuracion: Record<string, string>;
  activo: boolean;
  readonly creadoEn: string;
  actualizadoEn: string;
}
