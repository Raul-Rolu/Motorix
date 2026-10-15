/**
 * Validación de refacciones y movimientos de inventario (Sprint 3, T034).
 * Funciones puras que devuelven la lista de mensajes de error en español.
 *
 * Las cantidades (≠ 0 y signo) se validan en el servicio/modelo con el error
 * MOVEMENT_INVALID (422, T030); aquí solo lo estructural.
 */
import { esTextoNoVacio } from './validation-helpers.js';

/** Entero estricto mayor o igual que cero. */
function esEnteroNoNegativo(valor) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0;
}

/** Alta o edición de refacción (FR-008). */
export function validarParte(body, { esEdicion = false } = {}) {
  const errores = [];
  const datos = body ?? {};

  if (!esEdicion || datos.name !== undefined) {
    if (!esTextoNoVacio(datos.name, 100)) {
      errores.push('El nombre es obligatorio (máximo 100 caracteres).');
    }
  }
  if (!esEdicion || datos.code !== undefined) {
    if (!esTextoNoVacio(datos.code, 50)) {
      errores.push('El código es obligatorio (máximo 50 caracteres).');
    }
  }
  if (!esEdicion && datos.stock !== undefined && datos.stock !== null && datos.stock !== '') {
    if (!esEnteroNoNegativo(datos.stock)) {
      errores.push('El stock inicial debe ser un número entero mayor o igual a cero.');
    }
  }
  if (datos.minStock !== undefined && datos.minStock !== null && datos.minStock !== '') {
    if (!esEnteroNoNegativo(datos.minStock)) {
      errores.push('El stock mínimo debe ser un número entero mayor o igual a cero.');
    }
  }
  if (datos.isActive !== undefined && typeof datos.isActive !== 'boolean') {
    errores.push('El estado (isActive) debe ser verdadero o falso.');
  }

  return errores;
}

/**
 * Movimiento manual de stock (FR-014): solo IN y ADJUSTMENT; el OUT se
 * origina únicamente al usar la refacción en una orden (RN-6, US7).
 * La cantidad (entera, ≠ 0 y con signo válido) se valida en el servicio con
 * MOVEMENT_INVALID (422, T030); aquí solo lo estructural.
 */
export function validarMovimiento(body) {
  const errores = [];
  const datos = body ?? {};

  if (!['IN', 'ADJUSTMENT'].includes(datos.movementType)) {
    errores.push('El tipo de movimiento debe ser IN (entrada) o ADJUSTMENT (ajuste).');
  }
  if (!esTextoNoVacio(datos.reason, 255)) {
    errores.push('El motivo del movimiento es obligatorio (máximo 255 caracteres).');
  }

  return errores;
}
