/**
 * Validación del catálogo de tipos de servicio
 * (008-configuracion-seguridad-reportes, T037; FR-006, CA-4, RN-12). Funciones
 * puras con mensajes en español. Cada tipo exige al menos un intervalo (días,
 * km o ambos); no se asume ningún valor universal.
 */

export const LIMITE_NOMBRE = 80;
export const LIMITE_DIAS = 3650;
export const LIMITE_KM = 500000;

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const falta = (valor) => valor === undefined || valor === null;

/** Valida un intervalo opcional: entero (no texto ni decimal) de 1 al máximo. */
function validarIntervalo(valor, etiqueta, maximo, errores) {
  if (falta(valor)) {
    return;
  }
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > maximo) {
    errores.push(`${etiqueta} debe ser un número entero entre 1 y ${maximo}.`);
  }
}

/** Cuerpo de `POST` y `PUT /api/service-types`. */
export function validarTipoServicio(payload) {
  const errores = [];
  if (!esObjeto(payload)) {
    return ['El cuerpo debe indicar los datos del tipo de servicio.'];
  }

  const nombre = typeof payload.nombre === 'string' ? payload.nombre.trim() : '';
  if (nombre.length === 0) {
    errores.push('El nombre del tipo de servicio es obligatorio.');
  } else if (nombre.length > LIMITE_NOMBRE) {
    errores.push(`El nombre del tipo de servicio no puede exceder ${LIMITE_NOMBRE} caracteres.`);
  }

  validarIntervalo(payload.intervaloDias, 'El intervalo en días', LIMITE_DIAS, errores);
  validarIntervalo(payload.intervaloKm, 'El intervalo en kilómetros', LIMITE_KM, errores);

  if (falta(payload.intervaloDias) && falta(payload.intervaloKm)) {
    errores.push('Debe indicar al menos un intervalo: en días, en kilómetros o ambos.');
  }
  return errores;
}

/** Cuerpo de `PATCH /api/service-types/:id/status`. */
export function validarEstadoTipoServicio(payload) {
  if (!esObjeto(payload) || typeof payload.activo !== 'boolean') {
    return ['El campo «activo» es obligatorio y debe ser verdadero o falso.'];
  }
  return [];
}
