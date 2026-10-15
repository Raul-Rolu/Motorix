// T015: validador de payloads de órdenes de servicio (US2).
// RN-3: mileageEntry obligatorio y entero >= 0. RN-4: mileageCorrection booleano.
// RN-2: vehicleId obligatorio. reason obligatorio (máx. 255), notes opcional.
import { esTextoNoVacio } from './validation-helpers.js';

export function validarCreacionOrden(payload) {
  const errores = [];

  if (payload?.vehicleId == null || !Number.isInteger(Number(payload.vehicleId))) {
    errores.push('El vehículo (vehicleId) es obligatorio (RN-2).');
  }
  if (
    payload?.mileageEntry == null ||
    !Number.isInteger(Number(payload.mileageEntry)) ||
    Number(payload.mileageEntry) < 0
  ) {
    errores.push('El kilometraje de entrada (mileageEntry) es obligatorio y debe ser un entero mayor o igual a cero (RN-3).');
  }
  if (!esTextoNoVacio(payload?.reason, 255)) {
    errores.push('El motivo (reason) es obligatorio (máximo 255 caracteres).');
  }
  if (payload?.notes != null && !esTextoNoVacio(payload.notes, 255)) {
    errores.push('Las notas deben tener como máximo 255 caracteres.');
  }
  if (payload?.mileageCorrection != null && typeof payload.mileageCorrection !== 'boolean') {
    errores.push('La corrección de kilometraje (mileageCorrection) debe ser true o false.');
  }
  if (
    payload?.mechanicId != null &&
    payload?.mechanicId !== '' &&
    !Number.isInteger(Number(payload.mechanicId))
  ) {
    errores.push('El mecánico (mechanicId) debe ser un identificador numérico o null.');
  }
  return errores;
}

/** Edición de motivo, notas y kilometraje con corrección (solo estados de trabajo). */
export function validarEdicionOrden(payload) {
  const errores = [];

  if (!esTextoNoVacio(payload?.reason, 255)) {
    errores.push('El motivo (reason) es obligatorio (máximo 255 caracteres).');
  }
  if (payload?.notes != null && !esTextoNoVacio(payload.notes, 255)) {
    errores.push('Las notas deben tener como máximo 255 caracteres.');
  }
  if (
    payload?.mileageEntry != null &&
    (!Number.isInteger(Number(payload.mileageEntry)) || Number(payload.mileageEntry) < 0)
  ) {
    errores.push('El kilometraje de entrada (mileageEntry) debe ser un entero mayor o igual a cero (RN-3).');
  }
  if (payload?.mileageCorrection != null && typeof payload.mileageCorrection !== 'boolean') {
    errores.push('La corrección de kilometraje (mileageCorrection) debe ser true o false.');
  }
  return errores;
}

const TIPOS_ENTRADA = ['DIAGNOSTIC', 'OBSERVATION', 'RECOMMENDATION'];

/** Entrada fechada de la orden (FR-011/FR-014, Clarificación 5). */
export function validarEntradaOrden(payload) {
  const errores = [];
  if (!TIPOS_ENTRADA.includes(payload?.entryType)) {
    errores.push('El tipo de entrada (entryType) debe ser DIAGNOSTIC, OBSERVATION o RECOMMENDATION.');
  }
  if (
    typeof payload?.content !== 'string' ||
    payload.content.trim().length === 0
  ) {
    errores.push('El contenido de la entrada (content) es obligatorio.');
  }
  return errores;
}

/** Partida de servicio o mano de obra (informativa; importe >= 0). */
export function validarPartida(payload) {
  const errores = [];
  if (!esTextoNoVacio(payload?.description, 255)) {
    errores.push('La descripción de la partida (description) es obligatoria (máximo 255 caracteres).');
  }
  const monto = Number(payload?.amount);
  if (payload?.amount == null || !Number.isFinite(monto) || monto < 0) {
    errores.push('El importe (amount) debe ser un número mayor o igual a cero.');
  }
  if (!['SERVICE', 'LABOR'].includes(payload?.kind)) {
    errores.push('El tipo de partida (kind) debe ser SERVICE o LABOR.');
  }
  return errores;
}

/** Refacción usada en la orden (Sprint 3, US7; FR-011). */
export function validarRefaccionOrden(payload) {
  const errores = [];
  if (
    payload?.partId == null ||
    !Number.isInteger(Number(payload.partId)) ||
    Number(payload.partId) <= 0
  ) {
    errores.push('La refacción (partId) es obligatoria y debe ser un identificador válido.');
  }
  if (
    payload?.quantity == null ||
    !Number.isInteger(Number(payload.quantity)) ||
    Number(payload.quantity) <= 0
  ) {
    errores.push('La cantidad (quantity) debe ser un número entero mayor que cero.');
  }
  return errores;
}
