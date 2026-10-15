// T025: validadores de los payloads de autenticación (US1).
import {
  esTextoNoVacio,
  cumplePoliticaContrasena,
} from './validation-helpers.js';

/** Valida el payload de POST /api/auth/login. Devuelve la lista de errores. */
export function validarLogin(payload) {
  const errores = [];
  if (!esTextoNoVacio(payload?.identificacion, 100)) {
    errores.push('La identificación es obligatoria.');
  }
  if (typeof payload?.contrasena !== 'string' || payload.contrasena.length === 0) {
    errores.push('La contraseña es obligatoria.');
  }
  return errores;
}

/** Valida el payload de POST /api/auth/change-password (FR-011, RN-17). */
export function validarCambioContrasena(payload) {
  const errores = [];
  if (typeof payload?.contrasenaActual !== 'string' || payload.contrasenaActual.length === 0) {
    errores.push('La contraseña actual es obligatoria.');
  }
  if (!cumplePoliticaContrasena(payload?.contrasenaNueva)) {
    errores.push(
      'La contraseña nueva no cumple la política mínima: 8 caracteres, mayúscula, minúscula y número.'
    );
  }
  return errores;
}
