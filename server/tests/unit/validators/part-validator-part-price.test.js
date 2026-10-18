// 005-precio-venta-refacciones, T006 (US1): validación de salePrice (FR-001, CA-2).
import { validarParte } from '../../../validators/part-validator.js';

test('un salePrice decimal no negativo no produce errores', () => {
  const errores = validarParte({ name: 'Filtro de aceite', code: 'FLT-001', salePrice: 85.5 });
  expect(errores).toEqual([]);
});

test('un salePrice igual a cero es válido (obsequio)', () => {
  const errores = validarParte({ name: 'Filtro de aceite', code: 'FLT-001', salePrice: 0 });
  expect(errores).toEqual([]);
});

test('un salePrice nulo deja la refacción pendiente de precio sin errores', () => {
  const errores = validarParte({ name: 'Filtro de aceite', code: 'FLT-001', salePrice: null });
  expect(errores).toEqual([]);
});

test('un salePrice ausente no produce errores', () => {
  const errores = validarParte({ name: 'Filtro de aceite', code: 'FLT-001' });
  expect(errores).toEqual([]);
});

test('un salePrice negativo se rechaza con mensaje claro', () => {
  const errores = validarParte({ name: 'Filtro de aceite', code: 'FLT-001', salePrice: -5 });
  expect(errores).toHaveLength(1);
  expect(errores[0]).toContain('precio de venta');
});

test('un salePrice no numérico se rechaza con mensaje claro', () => {
  const errores = validarParte({ name: 'Filtro de aceite', code: 'FLT-001', salePrice: 'ochenta' });
  expect(errores).toHaveLength(1);
  expect(errores[0]).toContain('precio de venta');
});

test('un salePrice con más de dos decimales se rechaza', () => {
  const errores = validarParte({ name: 'Filtro de aceite', code: 'FLT-001', salePrice: 85.555 });
  expect(errores).toHaveLength(1);
  expect(errores[0]).toContain('precio de venta');
});
