/**
 * Validación de refacciones y movimientos de inventario (Sprint 3, T034).
 * Funciones puras que devuelven la lista de mensajes de error en español.
 *
 * Las cantidades (≠ 0 y signo) se validan en el servicio/modelo con el error
 * MOVEMENT_INVALID (422, T030); aquí solo lo estructural.
 */
import { esTextoNoVacio } from './validation-helpers.js';
import { aCentavos, LIMITE_PRECIO_CENTAVOS } from '../utils/money.js';

/**
 * Catálogo fijo de categorías de refacción (006, FR-002; research D3). Lista
 * del sistema, no administrable; `null` = sin clasificar.
 */
export const CATEGORIAS_REFACCION = [
  'FRENOS',
  'MOTOR',
  'SUSPENSION',
  'ELECTRICO',
  'TRANSMISION',
  'CLIMA',
  'NEUMATICOS',
  'LUBRICANTES',
  'OTRO',
];

/** Longitud máxima de la marca (006, FR-002). */
export const LONGITUD_MAXIMA_MARCA = 50;

/**
 * Valida un precio capturable (006, FR-003, CA-2) y devuelve su mensaje de
 * error o null. Mensajes separados: no numérico, negativo, más de 2
 * decimales y límite máximo de 999,999.99.
 */
function validarPrecio(valor, etiqueta) {
  const numero = typeof valor === 'string' ? Number(valor.trim()) : Number(valor);
  if (typeof valor !== 'number' && typeof valor !== 'string') {
    return `El ${etiqueta} debe ser un número.`;
  }
  if (!Number.isFinite(numero)) {
    return `El ${etiqueta} debe ser un número.`;
  }
  if (numero < 0) {
    return `El ${etiqueta} no puede ser negativo (debe ser mayor o igual a cero).`;
  }
  const centavos = numero * 100;
  if (Math.abs(centavos - Math.round(centavos)) >= 1e-6) {
    return `El ${etiqueta} admite como máximo 2 decimales.`;
  }
  if (aCentavos(numero) > LIMITE_PRECIO_CENTAVOS) {
    return `El ${etiqueta} no puede superar 999,999.99.`;
  }
  return null;
}

/** true si el campo opcional viene informado (ni ausente, ni null, ni vacío). */
function vieneInformado(valor) {
  return valor !== undefined && valor !== null && valor !== '';
}

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
  // Precio de venta (005, FR-001) y de compra (006, FR-001): opcionales;
  // null = pendiente. Numéricos, no negativos, hasta 2 decimales y
  // ≤ 999,999.99 (CA-2).
  for (const [campo, etiqueta] of [
    ['salePrice', 'precio de venta'],
    ['purchasePrice', 'precio de compra'],
  ]) {
    if (vieneInformado(datos[campo])) {
      const mensaje = validarPrecio(datos[campo], etiqueta);
      if (mensaje) {
        errores.push(mensaje);
      }
    }
  }
  // Categoría (006, FR-002): opcional y de la lista fija del sistema.
  if (vieneInformado(datos.category) && !CATEGORIAS_REFACCION.includes(datos.category)) {
    errores.push(
      `La categoría debe ser una de: ${CATEGORIAS_REFACCION.join(', ')}.`
    );
  }
  // Marca (006, FR-002): opcional, texto libre de hasta 50 caracteres.
  if (vieneInformado(datos.brand)) {
    if (typeof datos.brand !== 'string' || datos.brand.trim().length > LONGITUD_MAXIMA_MARCA) {
      errores.push(`La marca no puede superar los ${LONGITUD_MAXIMA_MARCA} caracteres.`);
    }
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
