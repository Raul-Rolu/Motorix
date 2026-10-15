// T033: pruebas unitarias del validador de citas (US1).
import {
  validarCreacionCita,
  validarCambioEstadoCita,
} from '../../../validators/appointment-validator.js';

const hoy = () => {
  const fecha = new Date();
  return fecha.toISOString().slice(0, 10);
};

test('una cita válida no produce errores', () => {
  expect(
    validarCreacionCita({
      clientId: 1,
      vehicleId: 1,
      appointmentDate: hoy(),
      appointmentTime: '10:30',
      reason: 'Revisión de frenos',
    })
  ).toEqual([]);
});

test('los campos obligatorios son cliente, vehículo, fecha, hora y motivo', () => {
  const errores = validarCreacionCita({});
  expect(errores.length).toBeGreaterThanOrEqual(5);
  expect(errores.join(' ')).toContain('clientId');
  expect(errores.join(' ')).toContain('vehicleId');
  expect(errores.join(' ')).toContain('appointmentDate');
  expect(errores.join(' ')).toContain('appointmentTime');
  expect(errores.join(' ')).toContain('reason');
});

test('rechaza una fecha anterior a hoy', () => {
  const errores = validarCreacionCita({
    clientId: 1,
    vehicleId: 1,
    appointmentDate: '2020-01-01',
    appointmentTime: '10:00',
    reason: 'Revisión',
  });
  expect(errores.join(' ')).toContain('fecha');
});

test('rechaza formatos de fecha u hora inválidos', () => {
  expect(
    validarCreacionCita({
      clientId: 1,
      vehicleId: 1,
      appointmentDate: 'mañana',
      appointmentTime: '10:00',
      reason: 'Revisión',
    }).join(' ')
  ).toContain('appointmentDate');

  expect(
    validarCreacionCita({
      clientId: 1,
      vehicleId: 1,
      appointmentDate: hoy(),
      appointmentTime: '9:5',
      reason: 'Revisión',
    }).join(' ')
  ).toContain('appointmentTime');

  expect(
    validarCreacionCita({
      clientId: 1,
      vehicleId: 1,
      appointmentDate: hoy(),
      appointmentTime: '25:00',
      reason: 'Revisión',
    }).join(' ')
  ).toContain('appointmentTime');
});

test('la cancelación exige motivo y solo acepta estados válidos', () => {
  expect(validarCambioEstadoCita({ status: 'COMPLETADA' })).toEqual([]);
  expect(validarCambioEstadoCita({ status: 'CANCELADA', cancellationReason: 'El cliente reprogramó.' })).toEqual([]);

  expect(validarCambioEstadoCita({ status: 'CANCELADA' }).join(' ')).toContain(
    'cancellationReason'
  );
  expect(validarCambioEstadoCita({ status: 'PROGRAMADA' }).join(' ')).toContain(
    'status'
  );
  expect(validarCambioEstadoCita({ status: 'INVENTADA' }).join(' ')).toContain(
    'status'
  );
  expect(
    validarCambioEstadoCita({ status: 'CANCELADA', cancellationReason: '   ' }).join(' ')
  ).toContain('cancellationReason');
});
