/**
 * Claves de aviso (007-notificaciones-internas, T009; FR-006, CA-6).
 *
 * La identidad de un aviso para la lectura por usuario es `TIPO:ID:ESTADO`
 * (por ejemplo `MANTENIMIENTO:12:VENCIDO`, `STOCK:7:AGOTADO`,
 * `ORDEN:5:DETENIDA`). Como el estado forma parte de la clave, un aviso que
 * empeora (de próximo a vencido, de stock bajo a agotado) cambia de clave y
 * vuelve a mostrarse como no leído. Funciones puras, sin base de datos.
 */

/** Longitud máxima de una clave: coincide con `notification_reads.notification_key`. */
export const LONGITUD_MAXIMA_CLAVE = 80;

/**
 * Tipos de hecho que se avisan al cliente (007, US7). Coinciden con el ENUM
 * `client_notices.notice_type` de la migración 018.
 */
export const TIPOS_DE_HECHO = Object.freeze(['ORDEN_TERMINADA', 'CITA_MANANA', 'MANTENIMIENTO']);

/** Identificador máximo: las claves primarias son INT UNSIGNED. */
const ID_MAXIMO = 4294967295;

/** Estados válidos de cada tipo de aviso (data-model.md, sección 4). */
export const ESTADOS_POR_TIPO = Object.freeze({
  MANTENIMIENTO: Object.freeze(['VENCIDO', 'PROXIMO']),
  CITA: Object.freeze(['HOY']),
  STOCK: Object.freeze(['BAJO', 'AGOTADO']),
  ORDEN: Object.freeze(['DETENIDA']),
});

const FORMATO = /^([A-Z]+):([1-9][0-9]*):([A-Z]+)$/;

/** Identificador positivo como entero (acepta número o texto numérico) o null. */
function normalizarId(id) {
  const texto = typeof id === 'number' ? String(id) : id;
  if (typeof texto !== 'string' || !/^[1-9][0-9]*$/.test(texto)) {
    return null;
  }
  const numero = Number(texto);
  return Number.isSafeInteger(numero) && numero <= ID_MAXIMO ? numero : null;
}

function combinacionValida(tipo, estado) {
  return Object.hasOwn(ESTADOS_POR_TIPO, tipo) && ESTADOS_POR_TIPO[tipo].includes(estado);
}

/** Arma la clave de un aviso; lanza un Error si algún dato no es válido. */
export function construirClave(tipo, id, estado) {
  if (!combinacionValida(tipo, estado)) {
    throw new Error(`Combinación de tipo y estado de aviso no válida: ${tipo}/${estado}.`);
  }
  const numero = normalizarId(id);
  if (numero === null) {
    throw new Error(`Identificador de aviso no válido: ${id}.`);
  }
  const clave = `${tipo}:${numero}:${estado}`;
  if (clave.length > LONGITUD_MAXIMA_CLAVE) {
    throw new Error('La clave del aviso excede la longitud máxima.');
  }
  return clave;
}

/** Descompone una clave en `{ tipo, id, estado }`; devuelve null si no es válida. */
export function descomponerClave(clave) {
  if (typeof clave !== 'string' || clave.length > LONGITUD_MAXIMA_CLAVE) {
    return null;
  }
  const coincidencia = FORMATO.exec(clave);
  if (!coincidencia) {
    return null;
  }
  const [, tipo, textoId, estado] = coincidencia;
  const id = normalizarId(textoId);
  if (id === null || !combinacionValida(tipo, estado)) {
    return null;
  }
  return { tipo, id, estado };
}

/** ¿La clave tiene el formato `TIPO:ID:ESTADO` con un tipo y estado conocidos? */
export function esClaveValida(clave) {
  return descomponerClave(clave) !== null;
}
