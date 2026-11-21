/**
 * Utilidades de dinero en centavos enteros (006-complemento-precios-compra,
 * T006; FR-007, CA-5; research D5).
 *
 * Los importes se guardan como `DECIMAL(10,2)` (exactos en MySQL), pero en
 * JavaScript las sumas y comparaciones se hacen con enteros (centavos) para
 * evitar errores de coma flotante; solo se vuelve a decimales al presentar
 * o persistir.
 */

/** Precio máximo capturable: 999,999.99 expresado en centavos. */
export const LIMITE_PRECIO_CENTAVOS = 99_999_999;

/** Total máximo de una orden: 99,999,999.99 expresado en centavos. */
export const LIMITE_TOTAL_CENTAVOS = 9_999_999_999;

/**
 * Convierte un importe (número o texto numérico) a centavos enteros.
 * `toPrecision(15)` descarta el ruido de coma flotante (0.1 + 0.2 =
 * 0.30000000000000004) antes de multiplicar por 100 y redondear.
 */
export function aCentavos(valor) {
  return Math.round(Number(Number(valor).toPrecision(15)) * 100);
}

/** Convierte centavos enteros a un importe con dos decimales exactos. */
export function deCentavos(centavos) {
  return Number(centavos) / 100;
}

/**
 * Indica si el valor es un importe válido: numérico finito, no negativo y con
 * hasta dos decimales. No valida los límites máximos (ver las constantes).
 */
export function esImporteValido(valor) {
  if (typeof valor !== 'number' && typeof valor !== 'string') {
    return false;
  }
  if (typeof valor === 'string' && valor.trim() === '') {
    return false;
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) {
    return false;
  }
  const centavos = numero * 100;
  return Math.abs(centavos - Math.round(centavos)) < 1e-6;
}
