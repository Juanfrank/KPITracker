import { TipoDato } from '../value-objects/TipoDato';
import type { ColumnaEav } from '../value-objects/TipoDato';
import type { ResultadoParse, TypeDescriptor, ValorAtributo } from './TypeDescriptor';
import type { ErrorValidacion, ValidacionAtributo } from '../rules/Validaciones';
import { TypeRegistry } from './TypeRegistry';

function ok(valor: ValorAtributo): ResultadoParse {
  return { ok: true, valor };
}
function fallo(error: string): ResultadoParse {
  return { ok: false, valor: null, error };
}

function validarTexto(valor: ValorAtributo, validaciones: ValidacionAtributo[]): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  const texto = valor == null ? '' : String(valor);
  for (const v of validaciones) {
    if (v.tipo === 'LongitudMinima' && texto.length < v.valor) {
      errores.push({ validacion: v.tipo, mensaje: `Longitud mínima: ${v.valor} caracteres.` });
    } else if (v.tipo === 'LongitudMaxima' && texto.length > v.valor) {
      errores.push({ validacion: v.tipo, mensaje: `Longitud máxima: ${v.valor} caracteres.` });
    } else if (v.tipo === 'ExpresionRegular' && texto !== '' && !new RegExp(v.patron).test(texto)) {
      errores.push({ validacion: v.tipo, mensaje: v.mensaje ?? 'No cumple el formato requerido.' });
    }
  }
  return errores;
}

function validarNumero(valor: ValorAtributo, validaciones: ValidacionAtributo[]): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (typeof valor !== 'number') return errores;
  for (const v of validaciones) {
    if (v.tipo === 'ValorMinimo' && valor < v.valor) {
      errores.push({ validacion: v.tipo, mensaje: `Valor mínimo: ${v.valor}.` });
    } else if (v.tipo === 'ValorMaximo' && valor > v.valor) {
      errores.push({ validacion: v.tipo, mensaje: `Valor máximo: ${v.valor}.` });
    }
  }
  return errores;
}

function validarFecha(valor: ValorAtributo, validaciones: ValidacionAtributo[]): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (typeof valor !== 'string' || valor === '') return errores;
  for (const v of validaciones) {
    if (v.tipo === 'FechaMinima' && valor < v.valor) {
      errores.push({ validacion: v.tipo, mensaje: `Fecha mínima: ${v.valor}.` });
    } else if (v.tipo === 'FechaMaxima' && valor > v.valor) {
      errores.push({ validacion: v.tipo, mensaje: `Fecha máxima: ${v.valor}.` });
    }
  }
  return errores;
}

function tipoTexto(tipo: TipoDato, etiqueta: string, patron?: RegExp, mensajePatron?: string): TypeDescriptor {
  return {
    tipo,
    etiqueta,
    columnaEav: 'texto',
    editorHint: 'text',
    parse(crudo) {
      const texto = crudo.trim();
      if (texto !== '' && patron && !patron.test(texto)) return fallo(mensajePatron ?? 'Formato inválido.');
      return ok(texto === '' ? null : texto);
    },
    format: (v) => (v == null ? '' : String(v)),
    validar: validarTexto
  };
}

function tipoEnteroCon(tipo: TipoDato, etiqueta: string, min: bigint, max: bigint): TypeDescriptor {
  return {
    tipo,
    etiqueta,
    columnaEav: 'numero',
    editorHint: 'number',
    parse(crudo) {
      const texto = crudo.trim().replace(/,/g, '');
      if (texto === '') return ok(null);
      if (!/^-?\d+$/.test(texto)) return fallo('Debe ser un número entero.');
      const n = BigInt(texto);
      if (n < min || n > max) return fallo(`Fuera de rango para ${etiqueta} (${min} a ${max}).`);
      return ok(Number(n));
    },
    format: (v) => (v == null ? '' : String(v)),
    validar: validarNumero
  };
}

function tipoDecimal(tipo: TipoDato, etiqueta: string, opciones?: { sufijo?: string; prefijo?: string }): TypeDescriptor {
  return {
    tipo,
    etiqueta,
    columnaEav: 'numero',
    editorHint: 'number',
    parse(crudo) {
      let texto = crudo.trim().replace(/,/g, '').replace(/%$/, '').replace(/^\$/, '');
      texto = texto.trim();
      if (texto === '') return ok(null);
      const n = Number(texto);
      if (!Number.isFinite(n)) return fallo('Debe ser un número.');
      return ok(n);
    },
    format: (v) =>
      v == null ? '' : `${opciones?.prefijo ?? ''}${Number(v).toLocaleString('es', { maximumFractionDigits: 4 })}${opciones?.sufijo ?? ''}`,
    validar: validarNumero
  };
}

function tipoFechaHora(tipo: TipoDato, etiqueta: string, patron: RegExp, hint: string, ejemplo: string): TypeDescriptor {
  return {
    tipo,
    etiqueta,
    columnaEav: 'fecha',
    editorHint: hint,
    parse(crudo) {
      const texto = crudo.trim();
      if (texto === '') return ok(null);
      if (!patron.test(texto)) return fallo(`Formato esperado: ${ejemplo}.`);
      return ok(texto);
    },
    format: (v) => (v == null ? '' : String(v)),
    validar: validarFecha
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const PHONE_RE = /^[+\d][\d\s\-().]{4,}$/;

/** Registra los tipos de dato incorporados. Nuevos tipos se registran aparte. */
export function crearRegistroTiposBase(): TypeRegistry {
  const registro = new TypeRegistry();
  const registrar = (d: TypeDescriptor): void => registro.registrar(d);

  registrar(tipoTexto(TipoDato.ShortText, 'Texto corto'));
  registrar({ ...tipoTexto(TipoDato.LongText, 'Texto largo'), editorHint: 'textarea' });
  registrar({
    tipo: TipoDato.Boolean,
    etiqueta: 'Sí / No',
    columnaEav: 'booleano' as ColumnaEav,
    editorHint: 'checkbox',
    parse(crudo) {
      const texto = crudo.trim().toLowerCase();
      if (texto === '') return ok(null);
      if (['si', 'sí', 'true', '1', 'verdadero'].includes(texto)) return ok(true);
      if (['no', 'false', '0', 'falso'].includes(texto)) return ok(false);
      return fallo('Valor booleano inválido (Sí/No).');
    },
    format: (v) => (v == null ? '' : v ? 'Sí' : 'No'),
    validar: () => []
  });
  registrar(tipoEnteroCon(TipoDato.Int16, 'Entero (16 bits)', -32768n, 32767n));
  registrar(tipoEnteroCon(TipoDato.Int32, 'Entero (32 bits)', -2147483648n, 2147483647n));
  // Int64 limitado al rango seguro de JS; valores mayores requerirían BigInt de punta a punta.
  registrar(tipoEnteroCon(TipoDato.Int64, 'Entero (64 bits)', BigInt(Number.MIN_SAFE_INTEGER), BigInt(Number.MAX_SAFE_INTEGER)));
  registrar(tipoDecimal(TipoDato.Decimal, 'Decimal'));
  registrar(tipoDecimal(TipoDato.Double, 'Doble precisión'));
  registrar(tipoDecimal(TipoDato.Percentage, 'Porcentaje', { sufijo: ' %' }));
  registrar(tipoDecimal(TipoDato.Currency, 'Moneda', { prefijo: '$ ' }));
  registrar(tipoFechaHora(TipoDato.Date, 'Fecha', /^\d{4}-\d{2}-\d{2}$/, 'date', 'AAAA-MM-DD'));
  registrar(tipoFechaHora(TipoDato.DateTime, 'Fecha y hora', /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, 'datetime-local', 'AAAA-MM-DD HH:MM'));
  registrar(tipoFechaHora(TipoDato.Time, 'Hora', /^\d{2}:\d{2}(:\d{2})?$/, 'time', 'HH:MM'));
  registrar({
    tipo: TipoDato.Duration,
    etiqueta: 'Duración (minutos)',
    columnaEav: 'numero',
    editorHint: 'number',
    parse(crudo) {
      const texto = crudo.trim();
      if (texto === '') return ok(null);
      // Acepta minutos ("90") o formato HH:MM ("01:30").
      const hhmm = /^(\d+):(\d{2})$/.exec(texto);
      if (hhmm) return ok(Number(hhmm[1]) * 60 + Number(hhmm[2]));
      const n = Number(texto);
      if (!Number.isFinite(n) || n < 0) return fallo('Duración inválida (minutos o HH:MM).');
      return ok(n);
    },
    format: (v) => (v == null ? '' : `${Math.floor(Number(v) / 60)}:${String(Number(v) % 60).padStart(2, '0')}`),
    validar: validarNumero
  });
  registrar(tipoTexto(TipoDato.Email, 'Correo electrónico', EMAIL_RE, 'Correo electrónico inválido.'));
  registrar(tipoTexto(TipoDato.URL, 'URL', URL_RE, 'URL inválida (debe iniciar con http/https).'));
  registrar(tipoTexto(TipoDato.Phone, 'Teléfono', PHONE_RE, 'Teléfono inválido.'));
  registrar({
    tipo: TipoDato.SelectionList,
    etiqueta: 'Lista de selección',
    columnaEav: 'texto',
    editorHint: 'select',
    parse: (crudo) => ok(crudo.trim() === '' ? null : crudo.trim()),
    format: (v) => (v == null ? '' : String(v)),
    validar: validarTexto
  });
  registrar({
    tipo: TipoDato.MultiSelectionList,
    etiqueta: 'Lista de selección múltiple',
    columnaEav: 'texto',
    editorHint: 'multiselect',
    parse(crudo) {
      const texto = crudo.trim();
      if (texto === '') return ok(null);
      return ok(texto.split(';').map((s) => s.trim()).filter((s) => s !== ''));
    },
    format: (v) => (v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v)),
    validar: () => []
  });

  return registro;
}
