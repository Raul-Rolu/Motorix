/**
 * Folio del ticket de servicio (Sprint 4, T030, US3; research D4).
 *
 * Formato `TCK-AAAA-NNNN`: año de emisión y secuencia correlativa. Funciones
 * puras para pruebas deterministas; la unicidad la garantiza la restricción
 * UNIQUE de la tabla `tickets` (un ticket por orden y un folio por ticket).
 */

/** Formato canónico del folio (FR-012); el primer grupo es el año. */
export const FORMATO_FOLIO = /^TCK-(\d{4})-(\d{4})$/;

/** Genera el folio para un año y secuencia dados (p. ej. 2026, 1 → TCK-2026-0001). */
export function generarFolio(anio, secuencia) {
  return `TCK-${anio}-${String(secuencia).padStart(4, '0')}`;
}

/** ¿El texto cumple el formato de folio? (usado para validar antes de persistir). */
export function esFolioValido(folio) {
  return typeof folio === 'string' && FORMATO_FOLIO.test(folio);
}

/** Año contenido en el folio (para auditoría o búsquedas por periodo). */
export function anioDelFolio(folio) {
  const coincidencia = FORMATO_FOLIO.exec(String(folio ?? ''));
  return coincidencia ? Number(coincidencia[1]) : null;
}
