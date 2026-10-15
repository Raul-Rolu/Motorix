/**
 * Validación de mantenimientos (Sprint 3, T021, US3/US4).
 * Funciones puras que devuelven la lista de mensajes de error en español;
 * la validación real siempre ocurre en el servidor (RN-15).
 */
import { esTextoNoVacio } from './validation-helpers.js';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha en formato YYYY-MM-DD, calendarmente válida y no anterior a hoy. */
function esFechaObjetivoValida(valor) {
  if (typeof valor !== 'string' || !FECHA_RE.test(valor.trim())) {
    return false;
  }
  const [anio, mes, dia] = valor.trim().split('-').map(Number);
  const fecha = new Date(anio, mes - 1, dia);
  const esReal =
    fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
  if (!esReal) {
    return false;
  }
  const hoy = new Date();
  const hoyLocal = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return fecha >= hoyLocal;
}

/** Entero estricto mayor que cero. */
function esEnteroPositivo(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0;
}

/** Registro de un mantenimiento: vehículo, motivo y al menos un umbral (RN-11). */
export function validarRegistroMantenimiento(body) {
  const errores = [];
  const datos = body ?? {};

  if (!esEnteroPositivo(datos.vehicleId)) {
    errores.push('El vehículo (vehicleId) es obligatorio y debe ser un identificador válido.');
  }
  if (!esTextoNoVacio(datos.descripcion, 255)) {
    errores.push('La descripción del servicio es obligatoria (máximo 255 caracteres).');
  }

  const tieneFecha = datos.targetDate != null && datos.targetDate !== '';
  const tieneKilometraje = datos.targetMileage != null && datos.targetMileage !== '';

  // La ausencia de umbrales se responde con MAINTENANCE_INVALID_THRESHOLD
  // (422) desde el controlador; aquí solo se validan los que vengan.
  if (tieneFecha && !esFechaObjetivoValida(datos.targetDate)) {
    errores.push('La fecha objetivo debe tener formato YYYY-MM-DD, ser una fecha válida y no ser anterior a hoy.');
  }
  if (tieneKilometraje && !esEnteroPositivo(datos.targetMileage)) {
    errores.push('El kilometraje objetivo debe ser un número entero positivo.');
  }

  return errores;
}

/** Cancelación: motivo obligatorio (aclaración Q4 del spec). */
export function validarCancelacionMantenimiento(body) {
  const errores = [];
  if (!esTextoNoVacio(body?.reason, 255)) {
    errores.push('El motivo de la cancelación es obligatorio (máximo 255 caracteres).');
  }
  return errores;
}
