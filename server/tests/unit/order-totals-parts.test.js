// 005-precio-venta-refacciones, T016 (US2): cálculo puro de totales con
// refacciones (FR-007, FR-008, CA-7) — sin base de datos ni red.
import { calcularTotales } from '../../models/order.js';

test('una orden sin refacciones suma solo servicios y mano de obra (CA-7)', () => {
  const totales = calcularTotales({ services: 600, labor: 500 });
  expect(totales).toMatchObject({
    services: 600,
    labor: 500,
    parts: 0,
    grand: 1100,
    totalCompleto: true,
    refaccionesSinPrecio: 0,
  });
});

test('una orden sin nada registrado tiene total $0 y completo', () => {
  const totales = calcularTotales();
  expect(totales).toMatchObject({
    services: 0,
    labor: 0,
    parts: 0,
    grand: 0,
    totalCompleto: true,
    refaccionesSinPrecio: 0,
  });
});

test('las refacciones suman unit_price × cantidad al total (CA-6)', () => {
  const totales = calcularTotales({
    services: 600,
    labor: 500,
    partsTotal: 510,
    refaccionesSinPrecio: 0,
  });
  expect(totales.parts).toBe(510);
  expect(totales.grand).toBe(1610);
  expect(totales.totalCompleto).toBe(true);
});

test('un uso sin precio marca el total como incompleto (FR-008)', () => {
  const totales = calcularTotales({
    services: 600,
    labor: 500,
    partsTotal: 120, // solo la línea con precio
    refaccionesSinPrecio: 2,
  });
  expect(totales.parts).toBe(120);
  expect(totales.grand).toBe(1220);
  expect(totales.totalCompleto).toBe(false);
  expect(totales.refaccionesSinPrecio).toBe(2);
});
