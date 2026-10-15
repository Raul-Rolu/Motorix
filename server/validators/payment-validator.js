/**
 * Validación de pagos (Sprint 4, T008, US1/US2).
 * Funciones puras que devuelven la lista de mensajes de error en español.
 * El monto debe ser mayor que cero (caso límite del spec: montos 0 o
 * negativos se rechazan); la comparación contra el saldo pendiente se hace
 * en el servicio con PAYMENT_EXCEEDS_BALANCE (409, T013).
 */

/** Catálogo de métodos de pago (FR-001). */
export const METODOS_PAGO = ['CASH', 'CARD', 'TRANSFER', 'MERCADO_PAGO'];

/** Métodos manuales: nacen COMPLETED (research D1). */
export const METODOS_MANUALES = ['CASH', 'CARD', 'TRANSFER'];

/** Registro de un pago manual sobre una orden (US1). */
export function validarPago(body) {
  const errores = [];
  const datos = body ?? {};

  if (!METODOS_MANUALES.includes(datos.metodo)) {
    errores.push(
      'El método de pago debe ser CASH (efectivo), CARD (tarjeta) o TRANSFER (transferencia).'
    );
  }

  const monto = Number(datos.monto);
  if (
    datos.monto === undefined ||
    datos.monto === null ||
    datos.monto === '' ||
    !Number.isFinite(monto) ||
    monto <= 0
  ) {
    errores.push('El monto debe ser un número mayor que cero.');
  }

  return errores;
}

/** Creación de un cobro digital con Mercado Pago (US2). */
export function validarCobroDigital(body) {
  const errores = [];
  const datos = body ?? {};

  const monto = Number(datos.monto);
  if (
    datos.monto === undefined ||
    datos.monto === null ||
    datos.monto === '' ||
    !Number.isFinite(monto) ||
    monto <= 0
  ) {
    errores.push('El monto del cobro debe ser un número mayor que cero.');
  }

  return errores;
}
