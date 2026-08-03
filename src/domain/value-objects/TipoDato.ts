/**
 * Tipos de dato soportados para atributos dinámicos.
 * La lista es extensible: el núcleo no depende de valores concretos,
 * todo comportamiento por tipo vive en el TypeRegistry (ver data-types/).
 */
export enum TipoDato {
  ShortText = 'ShortText',
  LongText = 'LongText',
  Boolean = 'Boolean',
  Int16 = 'Int16',
  Int32 = 'Int32',
  Int64 = 'Int64',
  Decimal = 'Decimal',
  Double = 'Double',
  Percentage = 'Percentage',
  Currency = 'Currency',
  Date = 'Date',
  DateTime = 'DateTime',
  Time = 'Time',
  Duration = 'Duration',
  Email = 'Email',
  URL = 'URL',
  Phone = 'Phone',
  SelectionList = 'SelectionList',
  MultiSelectionList = 'MultiSelectionList'
}

/** Columna física del modelo EAV donde se persiste cada familia de valores. */
export type ColumnaEav = 'texto' | 'numero' | 'fecha' | 'booleano';
