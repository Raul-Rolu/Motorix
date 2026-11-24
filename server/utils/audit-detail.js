/**
 * Catálogo de acciones de la bitácora y construcción de su «detalle»
 * (008-configuracion-seguridad-reportes, T069; FR-012, FR-013, CA-20, CA-21).
 *
 * `construirDetalle` solo lee campos de una LISTA PERMITIDA por acción: aunque el
 * llamador pase contraseñas, hashes, tokens, datos de tarjeta o el precio de
 * compra, nunca llegan al texto. Del precio de compra solo se registra que
 * cambió, sin importes. Funciones puras, sin base de datos.
 */

/** Acciones auditadas (data-model.md, sección 4). */
export const ACCIONES = Object.freeze([
  'LOGIN_FAILED',
  'USER_CREATED',
  'USER_DEACTIVATED',
  'USER_REACTIVATED',
  'USER_ROLE_CHANGED',
  'SETTINGS_UPDATED',
  'PART_SALE_PRICE_CHANGED',
  'PART_PURCHASE_PRICE_CHANGED',
  'TERMS_PUBLISHED',
]);

/** Tipo de entidad afectada por cada acción. */
export const ENTIDAD_DE = Object.freeze({
  LOGIN_FAILED: 'SESSION',
  USER_CREATED: 'USER',
  USER_DEACTIVATED: 'USER',
  USER_REACTIVATED: 'USER',
  USER_ROLE_CHANGED: 'USER',
  SETTINGS_UPDATED: 'SETTINGS',
  PART_SALE_PRICE_CHANGED: 'PART',
  PART_PURCHASE_PRICE_CHANGED: 'PART',
  TERMS_PUBLISHED: 'TERMS',
});

/** Máximo de caracteres del identificador tecleado en un inicio de sesión fallido. */
export const LONGITUD_IDENTIFICADOR = 100;

/** Límite de la columna `detail`. */
const LIMITE_DETALLE = 255;

const PARECE_HASH = /^\$2[abxy]\$/;
const PARECE_TOKEN = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;

/**
 * Identificador tecleado, truncado. Si parece un hash de contraseña o un token
 * (alguien pegó un secreto en el campo de usuario) se omite.
 */
function identificadorSeguro(valor) {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    return '(vacío)';
  }
  const texto = valor.trim();
  if (PARECE_HASH.test(texto) || PARECE_TOKEN.test(texto)) {
    return '[omitido]';
  }
  return texto.slice(0, LONGITUD_IDENTIFICADOR);
}

/** Importe con dos decimales, o «sin precio» cuando no hay. */
function importe(valor) {
  const numero = valor === null || valor === undefined ? NaN : Number(valor);
  return Number.isFinite(numero) ? numero.toFixed(2) : 'sin precio';
}

/** Texto de un rol o un código: solo letras, números y guion bajo. */
function codigo(valor) {
  return typeof valor === 'string' && /^[A-Za-z0-9_]{1,30}$/.test(valor) ? valor : '(desconocido)';
}

/**
 * Detalle de una entrada de la bitácora, o `null` si la acción no lleva.
 * @param {string} accion Una de `ACCIONES`.
 * @param {object} [datos] Datos de la acción; solo se leen los campos permitidos.
 */
export function construirDetalle(accion, datos = {}) {
  let texto = null;
  switch (accion) {
    case 'LOGIN_FAILED':
      texto = `Identificador: ${identificadorSeguro(datos.identificador)}`;
      break;
    case 'USER_CREATED':
      texto = `Rol: ${codigo(datos.rol)}`;
      break;
    case 'USER_ROLE_CHANGED':
      texto = `Rol: ${codigo(datos.rolAnterior)} → ${codigo(datos.rolNuevo)}`;
      break;
    case 'SETTINGS_UPDATED':
      texto = `Claves: ${(Array.isArray(datos.claves) ? datos.claves : [])
        .filter((clave) => typeof clave === 'string')
        .join(', ')}`;
      break;
    case 'PART_SALE_PRICE_CHANGED':
      texto = `Precio de venta: ${importe(datos.anterior)} → ${importe(datos.nuevo)}`;
      break;
    case 'PART_PURCHASE_PRICE_CHANGED':
      // Dato reservado: solo se registra que cambió, nunca los importes.
      texto = 'Precio de compra modificado';
      break;
    case 'TERMS_PUBLISHED':
      texto = `Versión ${Number.isInteger(datos.version) ? datos.version : '(desconocida)'}`;
      break;
    default:
      return null;
  }
  return texto.slice(0, LIMITE_DETALLE);
}
