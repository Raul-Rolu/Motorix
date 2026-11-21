// T005 (006-complemento-precios-compra, CA-5): pruebas unitarias de la
// utilidad de dinero en centavos enteros (research D5).
//
// Funciones puras: sin red, sin base de datos y deterministas.
import {
  aCentavos,
  deCentavos,
  esImporteValido,
  LIMITE_PRECIO_CENTAVOS,
  LIMITE_TOTAL_CENTAVOS,
} from '../../utils/money.js';

test('aCentavos convierte importes con dos decimales a enteros exactos', () => {
  expect(aCentavos(1234.56)).toBe(123456);
  expect(aCentavos(0)).toBe(0);
  expect(aCentavos(19.99)).toBe(1999);
  expect(aCentavos('450.50')).toBe(45050);
});

test('aCentavos absorbe el error de coma flotante (0.1 + 0.2 = 30 centavos)', () => {
  // En coma flotante 0.1 + 0.2 = 0.30000000000000004; en centavos debe ser 30.
  expect(aCentavos(0.1 + 0.2)).toBe(30);
  expect(Number.isInteger(aCentavos(19.99 * 3))).toBe(true);
});

test('aCentavos siempre devuelve un entero', () => {
  for (const valor of [0.01, 0.07, 1.1, 2.675, 999999.99, 99999999.99]) {
    expect(Number.isInteger(aCentavos(valor))).toBe(true);
  }
});

test('deCentavos devuelve el importe con dos decimales exactos', () => {
  expect(deCentavos(123456)).toBe(1234.56);
  expect(deCentavos(30)).toBe(0.3);
  expect(deCentavos(0)).toBe(0);
});

test('sumar en centavos no deja diferencias de redondeo (diferencia $0)', () => {
  const importes = [0.1, 0.2, 19.99, 19.99, 19.99, 450.5];
  const sumaCentavos = importes.reduce((acc, v) => acc + aCentavos(v), 0);
  expect(sumaCentavos).toBe(10 + 20 + 1999 * 3 + 45050);
  expect(deCentavos(sumaCentavos)).toBe(510.77);
});

test('los límites en centavos son 999,999.99 por precio y 99,999,999.99 por total', () => {
  expect(LIMITE_PRECIO_CENTAVOS).toBe(99999999);
  expect(LIMITE_TOTAL_CENTAVOS).toBe(9999999999);
  expect(deCentavos(LIMITE_PRECIO_CENTAVOS)).toBe(999999.99);
  expect(deCentavos(LIMITE_TOTAL_CENTAVOS)).toBe(99999999.99);
});

test('esImporteValido acepta importes no negativos con hasta dos decimales', () => {
  expect(esImporteValido(0)).toBe(true);
  expect(esImporteValido(120)).toBe(true);
  expect(esImporteValido(78.5)).toBe(true);
  expect(esImporteValido('999999.99')).toBe(true);
  expect(esImporteValido(0.01)).toBe(true);
});

test('esImporteValido rechaza negativos, no numéricos y más de dos decimales', () => {
  expect(esImporteValido(-0.01)).toBe(false);
  expect(esImporteValido(-5)).toBe(false);
  expect(esImporteValido(NaN)).toBe(false);
  expect(esImporteValido(Infinity)).toBe(false);
  expect(esImporteValido('abc')).toBe(false);
  expect(esImporteValido('')).toBe(false);
  expect(esImporteValido(null)).toBe(false);
  expect(esImporteValido(undefined)).toBe(false);
  expect(esImporteValido(1.234)).toBe(false);
  expect(esImporteValido('10.999')).toBe(false);
});
