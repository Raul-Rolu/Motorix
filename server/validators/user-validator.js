// T034: validador de payloads de usuarios (US2).
import {
  esTextoNoVacio,
  esCorreoValido,
  esRolValido,
  cumplePoliticaContrasena,
} from './validation-helpers.js';

/** Cuerpo de error estándar de validación (contrato). */
export function errorDeValidacion(errores) {
  return { status: 400, codigo: 'DATOS_INVALIDOS', mensaje: errores.join(' ') };
}

/** Valida la creación de un usuario (requiere contraseña con política completa). */
export function validarCreacionUsuario(payload) {
  const errores = validarDatosBaseUsuario(payload);
  if (!esTextoNoVacio(payload?.password, 100)) {
    errores.push('La contraseña es obligatoria.');
  } else if (!cumplePoliticaContrasena(payload.password)) {
    errores.push(
      'La contraseña no cumple la política mínima: 8 caracteres, mayúscula, minúscula y número.'
    );
  }
  return errores;
}

/** Valida la edición de un usuario (sin campo de contraseña). */
export function validarEdicionUsuario(payload) {
  return validarDatosBaseUsuario(payload);
}

/** Valida el cambio de estado (desactivar/reactivar). */
export function validarCambioEstadoUsuario(payload) {
  const errores = [];
  if (typeof payload?.active !== 'boolean') {
    errores.push('El campo active debe ser true o false.');
  }
  return errores;
}

function validarDatosBaseUsuario(payload) {
  const errores = [];
  if (!esTextoNoVacio(payload?.username, 50)) {
    errores.push('El nombre de usuario es obligatorio (máximo 50 caracteres).');
  }
  if (!esTextoNoVacio(payload?.fullName, 100)) {
    errores.push('El nombre completo es obligatorio (máximo 100 caracteres).');
  }
  if (!esCorreoValido(payload?.email)) {
    errores.push('El correo electrónico debe tener un formato válido.');
  }
  if (!esRolValido(payload?.role)) {
    errores.push('El rol debe ser ADMIN, RECEPTIONIST o MECHANIC.');
  }
  return errores;
}
