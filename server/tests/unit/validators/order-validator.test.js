// T011: pruebas unitarias del validador de órdenes de servicio (US2).
// Cubre las restricciones de vehicleId, mileageEntry (entero >= 0, obligatorio),
// reason (obligatorio, máx. 255), notes opcional y mileageCorrection booleano.
import { validarCreacionOrden } from '../../../validators/order-validator.js';

test('una orden válida no produce errores', () => {
  expect(
    validarCreacionOrden({
      vehicleId: 1,
      mileageEntry: 45120,
      reason: 'Ruido al frenar',
      notes: 'Cliente reporta vibración',
      mileageCorrection: false,
      mechanicId: 3,
    })
  ).toEqual([]);
});

test('rechaza un payload vacío con mensajes claros', () => {
  const errores = validarCreacionOrden({});
  expect(errores.length).toBeGreaterThanOrEqual(3);
  expect(errores.join(' ')).toContain('vehicleId');
  expect(errores.join(' ')).toContain('mileageEntry');
  expect(errores.join(' ')).toContain('reason');
});

test('el kilometraje debe ser un entero mayor o igual a cero (RN-3)', () => {
  expect(
    validarCreacionOrden({ vehicleId: 1, mileageEntry: -5, reason: 'x' }).join(' ')
  ).toContain('kilometraje');
  expect(
    validarCreacionOrden({ vehicleId: 1, mileageEntry: 12.5, reason: 'x' }).join(' ')
  ).toContain('kilometraje');
  expect(
    validarCreacionOrden({ vehicleId: 1, mileageEntry: 'abc', reason: 'x' }).join(' ')
  ).toContain('kilometraje');
  expect(
    validarCreacionOrden({ vehicleId: 1, mileageEntry: 0, reason: 'Mantenimiento' })
  ).toEqual([]);
});

test('el motivo es obligatorio y no puede exceder 255 caracteres', () => {
  expect(
    validarCreacionOrden({ vehicleId: 1, mileageEntry: 1, reason: '   ' }).join(' ')
  ).toContain('motivo');
  expect(
    validarCreacionOrden({ vehicleId: 1, mileageEntry: 1, reason: 'x'.repeat(256) }).join(' ')
  ).toContain('motivo');
});

test('las notas son opcionales pero limitadas a 255 caracteres', () => {
  expect(
    validarCreacionOrden({
      vehicleId: 1,
      mileageEntry: 1,
      reason: 'Revisión',
      notes: 'x'.repeat(256),
    }).join(' ')
  ).toContain('notas');
  expect(
    validarCreacionOrden({ vehicleId: 1, mileageEntry: 1, reason: 'Revisión', notes: null })
  ).toEqual([]);
});

test('la corrección de kilometraje debe ser booleana si viene', () => {
  expect(
    validarCreacionOrden({
      vehicleId: 1,
      mileageEntry: 1,
      reason: 'Revisión',
      mileageCorrection: 'si',
    }).join(' ')
  ).toContain('mileageCorrection');
});

test('el mecánico, si viene, debe ser un identificador numérico o null', () => {
  expect(
    validarCreacionOrden({
      vehicleId: 1,
      mileageEntry: 1,
      reason: 'Revisión',
      mechanicId: 'juan',
    }).join(' ')
  ).toContain('mechanicId');
  expect(
    validarCreacionOrden({
      vehicleId: 1,
      mileageEntry: 1,
      reason: 'Revisión',
      mechanicId: null,
    })
  ).toEqual([]);
});
