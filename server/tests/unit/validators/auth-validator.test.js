// T018: pruebas unitarias del validador de login y cambio de contraseña (US1).
import { validarLogin, validarCambioContrasena } from '../../../validators/auth-validator.js';

test('la identificación y la contraseña son obligatorias en el login', () => {
  expect(validarLogin({})).toContain('La identificación es obligatoria.');
  expect(validarLogin({ identificacion: '   ' })).toContain('La identificación es obligatoria.');
  expect(validarLogin({ identificacion: 'admin' })).toContain('La contraseña es obligatoria.');
  expect(validarLogin({ identificacion: 'admin', contrasena: '' })).toContain('La contraseña es obligatoria.');
});

test('un login con identificación y contraseña no vacíos es válido', () => {
  expect(validarLogin({ identificacion: 'admin', contrasena: 'Admin123' })).toEqual([]);
  // El login también acepta un correo en el mismo campo (RN-16).
  expect(validarLogin({ identificacion: 'admin@motorix.local', contrasena: 'Admin123' })).toEqual([]);
});

test('el cambio de contraseña exige la contraseña actual', () => {
  expect(validarCambioContrasena({ contrasenaNueva: 'Nueva1234' })).toContain(
    'La contraseña actual es obligatoria.'
  );
});

test('la contraseña nueva debe cumplir la política mínima (8+, mayúscula, minúscula, número)', () => {
  expect(
    validarCambioContrasena({ contrasenaActual: 'Admin123', contrasenaNueva: 'corta1A' })
  ).toContain('La contraseña nueva no cumple la política mínima: 8 caracteres, mayúscula, minúscula y número.');
  expect(
    validarCambioContrasena({ contrasenaActual: 'Admin123', contrasenaNueva: 'sinmayuscula1' })
  ).not.toEqual([]);
  expect(validarCambioContrasena({ contrasenaActual: 'Admin123', contrasenaNueva: 'Nueva1234' })).toEqual([]);
});
