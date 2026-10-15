// T055: validador de payloads de vehículos (US5).
// Clarificación 2: placas, marca, modelo y año obligatorios; color y notas opcionales.
import { esTextoNoVacio, esAnioValido } from './validation-helpers.js';

export function validarVehiculo(payload) {
  const errores = [];
  if (!esTextoNoVacio(payload?.plates, 20)) {
    errores.push('Las placas son obligatorias (máximo 20 caracteres).');
  }
  if (!esTextoNoVacio(payload?.brand, 50)) {
    errores.push('La marca es obligatoria (máximo 50 caracteres).');
  }
  if (!esTextoNoVacio(payload?.model, 50)) {
    errores.push('El modelo es obligatorio (máximo 50 caracteres).');
  }
  if (!esAnioValido(payload?.year)) {
    errores.push('El año debe ser un número entre 1900 y el año actual más uno.');
  }
  if (payload?.clientId == null || !Number.isInteger(Number(payload.clientId))) {
    errores.push('El propietario (clientId) es obligatorio (RN-1).');
  }
  if (payload?.color != null && !esTextoNoVacio(payload.color, 30)) {
    errores.push('El color debe tener como máximo 30 caracteres.');
  }
  if (payload?.notes != null && !esTextoNoVacio(payload.notes, 255)) {
    errores.push('Las notas deben tener como máximo 255 caracteres.');
  }
  return errores;
}
