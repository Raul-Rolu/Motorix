/**
 * Utilidades de fechas locales (007-notificaciones-internas).
 *
 * «Hoy» y «mañana» se evalúan con la fecha local del servidor, la misma que
 * usa `hoyLocal()` de `maintenance-state.js`. Funciones puras.
 */

/** Fecha local `YYYY-MM-DD` de un objeto Date. */
export function fechaCorta(fecha) {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Fecha local (sin hora) N días después de `desde` (por omisión, hoy). */
export function diasDespues(dias, desde = new Date()) {
  return new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + dias);
}
