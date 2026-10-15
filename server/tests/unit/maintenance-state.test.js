// T016: pruebas unitarias del cálculo de vencimiento (US3, FR-006, RN-11).
// Funciones puras: no requieren base de datos.
import {
  diasRestantes,
  kmRestantes,
  esVencido,
  proximidad,
} from '../../services/maintenance-state.js';

// Fecha fija de referencia para que las pruebas no dependan del día real.
const HOY = new Date(2026, 9, 11); // 11 de octubre de 2026 (local)

test('diasRestantes devuelve días positivos para una fecha futura', () => {
  expect(diasRestantes('2026-10-21', HOY)).toBe(10);
});

test('diasRestantes devuelve 0 el día mismo del umbral (ya vencido)', () => {
  expect(diasRestantes('2026-10-11', HOY)).toBe(0);
});

test('diasRestantes devuelve negativo para una fecha pasada', () => {
  expect(diasRestantes('2026-10-01', HOY)).toBe(-10);
});

test('diasRestantes devuelve null sin umbral de fecha', () => {
  expect(diasRestantes(null, HOY)).toBeNull();
});

test('kmRestantes devuelve la diferencia hasta el kilometraje objetivo', () => {
  expect(kmRestantes(90000, 84500)).toBe(5500);
});

test('kmRestantes devuelve 0 o negativo cuando el kilometraje ya alcanzó el objetivo', () => {
  expect(kmRestantes(90000, 90000)).toBe(0);
  expect(kmRestantes(90000, 92000)).toBe(-2000);
});

test('kmRestantes devuelve null sin umbral de kilometraje', () => {
  expect(kmRestantes(null, 84500)).toBeNull();
});

test('esVencido con solo fecha: vencido cuando la fecha llegó', () => {
  expect(esVencido({ status: 'PENDING', targetDate: '2026-10-11', targetMileage: null }, 0, HOY)).toBe(true);
  expect(esVencido({ status: 'PENDING', targetDate: '2026-10-12', targetMileage: null }, 0, HOY)).toBe(false);
});

test('esVencido con solo kilometraje: vencido cuando el kilometraje alcanzó el objetivo', () => {
  expect(esVencido({ status: 'PENDING', targetDate: null, targetMileage: 84000 }, 84500, HOY)).toBe(true);
  expect(esVencido({ status: 'PENDING', targetDate: null, targetMileage: 90000 }, 84500, HOY)).toBe(false);
});

test('esVencido con ambos umbrales: rige el primero de los dos que se cumpla', () => {
  const mantenimiento = { status: 'PENDING', targetDate: '2026-12-01', targetMileage: 85000 };
  // El kilometraje se alcanza primero (umbral km cumplido, fecha aún lejana).
  expect(esVencido(mantenimiento, 85000, HOY)).toBe(true);
  // Fecha se cumple primero: kilometraje lejano pero la fecha ya llegó.
  expect(esVencido({ ...mantenimiento, targetMileage: 200000 }, 84000, new Date(2026, 11, 2))).toBe(true);
  // Ningún umbral cumplido: aún no vence.
  expect(esVencido(mantenimiento, 80000, HOY)).toBe(false);
});

test('esVencido es false para estados COMPLETED y CANCELLED aunque el umbral se cumpla', () => {
  expect(esVencido({ status: 'COMPLETED', targetDate: '2026-01-01', targetMileage: null }, 0, HOY)).toBe(false);
  expect(esVencido({ status: 'CANCELLED', targetDate: '2026-01-01', targetMileage: null }, 0, HOY)).toBe(false);
});

test('proximidad usa el umbral disponible (fecha o kilometraje)', () => {
  expect(proximidad({ targetDate: '2026-10-21', targetMileage: null }, 0, HOY)).toBe(10);
  expect(proximidad({ targetDate: null, targetMileage: 90000 }, 84500, HOY)).toBe(5500);
});

test('proximidad con ambos umbrales devuelve la menor de las dos medidas', () => {
  // Fecha más cercana (30 días) que el kilometraje (1000 km).
  expect(proximidad({ targetDate: '2026-11-10', targetMileage: 85500 }, 84500, HOY)).toBe(30);
  // Kilometraje más cercano (200 km) que la fecha (365 días).
  expect(proximidad({ targetDate: '2027-10-11', targetMileage: 84700 }, 84500, HOY)).toBe(200);
});

test('proximidad devuelve null sin umbrales', () => {
  expect(proximidad({ targetDate: null, targetMileage: null }, 0, HOY)).toBeNull();
});
