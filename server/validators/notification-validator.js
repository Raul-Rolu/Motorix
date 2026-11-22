/**
 * Validación de avisos internos (007-notificaciones-internas, T053 y T063).
 * Funciones puras que devuelven la lista de mensajes de error en español, igual
 * que el resto de los validadores del proyecto; la validación real siempre
 * ocurre en el servidor (RN-15).
 */
import {
  esClaveValida,
  LONGITUD_MAXIMA_CLAVE,
  TIPOS_DE_HECHO,
} from '../utils/notification-keys.js';

/** Longitud máxima de la nota de un aviso a cliente (data-model.md, `client_notices.note`). */
export const LONGITUD_MAXIMA_NOTA = 255;

/** Entero estricto mayor que cero (acepta número o texto numérico). */
function esEnteroPositivo(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') {
    return false;
  }
  const numero = Number(valor);
  return String(valor).trim() !== '' && Number.isInteger(numero) && numero > 0;
}

/** Aviso a un cliente: tipo de hecho, identificador del hecho y nota opcional (US7). */
export function validarAvisoACliente(body) {
  const errores = [];
  const datos = body ?? {};

  if (!TIPOS_DE_HECHO.includes(datos.tipo)) {
    errores.push(`El tipo de hecho (tipo) debe ser uno de: ${TIPOS_DE_HECHO.join(', ')}.`);
  }
  if (!esEnteroPositivo(datos.hechoId)) {
    errores.push('El identificador del hecho (hechoId) es obligatorio y debe ser un entero positivo.');
  }
  if (datos.nota !== undefined && datos.nota !== null) {
    if (typeof datos.nota !== 'string') {
      errores.push('La nota debe ser texto.');
    } else if (datos.nota.length > LONGITUD_MAXIMA_NOTA) {
      errores.push(`La nota no puede exceder ${LONGITUD_MAXIMA_NOTA} caracteres.`);
    }
  }
  return errores;
}

/** Marcar un aviso como leído: clave `TIPO:ID:ESTADO` obligatoria (US6). */
export function validarLectura(body) {
  const errores = [];
  const clave = body?.clave;

  if (clave === undefined || clave === null || clave === '') {
    errores.push('La clave del aviso (clave) es obligatoria.');
  } else if (typeof clave !== 'string') {
    errores.push('La clave del aviso (clave) debe ser texto.');
  } else if (clave.length > LONGITUD_MAXIMA_CLAVE) {
    errores.push(`La clave del aviso no puede exceder ${LONGITUD_MAXIMA_CLAVE} caracteres.`);
  } else if (!esClaveValida(clave)) {
    errores.push('La clave del aviso no tiene el formato TIPO:ID:ESTADO de un aviso conocido.');
  }
  return errores;
}
