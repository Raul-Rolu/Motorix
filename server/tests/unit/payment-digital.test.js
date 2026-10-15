// T022: pruebas unitarias de la lógica de pagos digitales (US2, FR-009/FR-010).
//
// Funciones puras con reloj inyectable: sin red, sin base de datos y
// deterministas (SC-008). La caducidad se aplica de forma perezosa con el
// plazo de 24 horas (research D3).
import { estadoCobroDe, debeCaducar } from '../../services/payment-service.js';
import { HORAS_CADUCIDAD_DIGITAL } from '../../models/payment.js';

test('el estado de cobro se deriva del total y lo cobrado (FR-004)', () => {
  expect(estadoCobroDe(0, 0)).toBe('LIQUIDADA');
  expect(estadoCobroDe(100, 0)).toBe('PENDIENTE');
  expect(estadoCobroDe(100, 60)).toBe('PARCIAL');
  expect(estadoCobroDe(100, 100)).toBe('LIQUIDADA');
  // Un cobro que supera el total no deja la orden en negativo.
  expect(estadoCobroDe(100, 150)).toBe('LIQUIDADA');
});

test('un cobro digital caduca recién después de las 24 horas (FR-009)', () => {
  const creado = new Date('2026-10-08T09:00:00');

  // 23 horas: aún vigente.
  expect(
    debeCaducar(creado, new Date('2026-10-09T08:00:00'))
  ).toBe(false);

  // Exactamente el plazo: aún no caduca (el límite es estricto).
  expect(
    debeCaducar(creado, new Date('2026-10-09T09:00:00'))
  ).toBe(false);

  // 24 horas y un minuto: caducado.
  expect(
    debeCaducar(creado, new Date('2026-10-09T09:01:00'))
  ).toBe(true);

  // Un cobro recién creado jamás caduca.
  expect(debeCaducar(new Date(), new Date())).toBe(false);
});

test('el plazo de caducidad usado por el modelo es de 24 horas', () => {
  expect(HORAS_CADUCIDAD_DIGITAL).toBe(24);
});
