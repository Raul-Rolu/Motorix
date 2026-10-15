/**
 * Helpers de validación reutilizables (T012, research D7).
 * Funciones puras que devuelven true/false o el dato normalizado; la política
 * de contraseñas cumple RN-17 y FR-011 (8+, mayúscula, minúscula, número).
 */

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEFONO_RE = /^[0-9+\-\s()]{7,20}$/;

/** Correo electrónico con formato válido. */
export function esCorreoValido(valor) {
  return typeof valor === 'string' && CORREO_RE.test(valor.trim());
}

/** Teléfono no vacío y con formato razonable (dígitos, +, -, espacios, paréntesis). */
export function esTelefonoValido(valor) {
  return typeof valor === 'string' && TELEFONO_RE.test(valor.trim());
}

/** Texto no vacío (sin contar espacios) y dentro de la longitud máxima. */
export function esTextoNoVacio(valor, maxLength = 255) {
  return (
    typeof valor === 'string' &&
    valor.trim().length > 0 &&
    valor.trim().length <= maxLength
  );
}

/** Año dentro del rango 1900 hasta el año actual + 1. */
export function esAnioValido(valor) {
  const anio = Number(valor);
  if (!Number.isInteger(anio)) {
    return false;
  }
  const maximo = new Date().getFullYear() + 1;
  return anio >= 1900 && anio <= maximo;
}

/**
 * Política mínima de contraseñas (RN-17, FR-011):
 * 8 caracteres como mínimo, con al menos una mayúscula, una minúscula y un número.
 */
export function cumplePoliticaContrasena(valor) {
  return (
    typeof valor === 'string' &&
    valor.length >= 8 &&
    /[A-Z]/.test(valor) &&
    /[a-z]/.test(valor) &&
    /[0-9]/.test(valor)
  );
}

/** Rol válido del MVP. */
export function esRolValido(valor) {
  return ['ADMIN', 'RECEPTIONIST', 'MECHANIC'].includes(valor);
}
