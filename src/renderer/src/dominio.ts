import { EvaluadorReglas, ValidadorAtributos, crearRegistroTiposBase } from '@domain/index';

/**
 * Instancias únicas del dominio para el renderer. El dominio es puro
 * (sin dependencias de Node/Electron), por lo que corre igual en el
 * proceso principal y en el navegador: la validación en vivo del
 * formulario evalúa exactamente las mismas reglas que el backend.
 */
export const tipos = crearRegistroTiposBase();
export const evaluadorReglas = new EvaluadorReglas();
export const validadorAtributos = new ValidadorAtributos(tipos, evaluadorReglas);
