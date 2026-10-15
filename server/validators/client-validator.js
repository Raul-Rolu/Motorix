// T042: validador de payloads de clientes (US3).
// Clarificación 1: nombre completo y teléfono obligatorios; correo opcional.
import { esTextoNoVacio, esCorreoValido, esTelefonoValido } from './validation-helpers.js';

/** Valida la creación o edición de un cliente. */
export function validarCliente(payload) {
  const errores = [];
  if (!esTextoNoVacio(payload?.fullName, 100)) {
    errores.push('El nombre completo es obligatorio (máximo 100 caracteres).');
  }
  if (!esTelefonoValido(payload?.phone)) {
    errores.push('El teléfono es obligatorio (7 a 20 dígitos; puede incluir +, -, espacios y paréntesis).');
  }
  if (payload?.email != null && payload.email !== '' && !esCorreoValido(payload.email)) {
    errores.push('El correo electrónico debe tener un formato válido.');
  }
  if (payload?.notes != null && !esTextoNoVacio(payload.notes, 255)) {
    errores.push('Las notas deben tener como máximo 255 caracteres.');
  }
  return errores;
}
