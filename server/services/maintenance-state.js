/**
 * Cálculo de vencimiento y proximidad de mantenimientos (Sprint 3, US3/US4).
 *
 * RN-11/FR-006: un mantenimiento se vence al cumplirse el PRIMERO de sus
 * umbrales (fecha o kilometraje); si solo tiene un umbral, se evalúa únicamente
 * ese. "Vencido" es una propiedad derivada del estado PENDING (research D2):
 * nunca se almacena. Funciones puras y probables sin base de datos.
 */

/** Fecha local (sin hora) de hoy, para comparar con los umbrales. */
export function hoyLocal() {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
}

/** Días restantes hasta la fecha objetivo (negativo si ya pasó); null sin fecha. */
export function diasRestantes(targetDate, hoy = hoyLocal()) {
  if (!targetDate) {
    return null;
  }
  const [anio, mes, dia] = String(targetDate).split('-').map(Number);
  const objetivo = new Date(anio, mes - 1, dia);
  return Math.round((objetivo - hoy) / 86400000);
}

/** Kilómetros restantes hasta el objetivo (negativo si ya se alcanzó); null sin umbral. */
export function kmRestantes(targetMileage, kmActual) {
  if (targetMileage == null) {
    return null;
  }
  return Number(targetMileage) - Number(kmActual ?? 0);
}

/**
 * ¿Está vencido? Solo PENDING y al menos un umbral alcanzado
 * (fecha llegó o kilometraje alcanzado).
 */
export function esVencido(mantenimiento, kmActual, hoy = hoyLocal()) {
  if (mantenimiento.status !== 'PENDING') {
    return false;
  }
  const dias = diasRestantes(mantenimiento.targetDate, hoy);
  if (dias != null && dias <= 0) {
    return true;
  }
  const km = kmRestantes(mantenimiento.targetMileage, kmActual);
  if (km != null && km <= 0) {
    return true;
  }
  return false;
}

/**
 * Márgenes del aviso de «mantenimiento próximo» (007-notificaciones-internas,
 * FR-012, decisión del 2026-11-22). Son constantes SOLO del aviso: la lista de
 * Mantenimientos y el panel de control no aplican margen. El Sprint 7 podrá
 * volverlas configurables.
 */
export const MARGEN_PROXIMO_DIAS = 30;
export const MARGEN_PROXIMO_KM = 1000;

/**
 * ¿Es un mantenimiento próximo? Pendiente, NO vencido y con su umbral de fecha
 * a MARGEN_PROXIMO_DIAS días o menos, o su umbral de kilometraje a
 * MARGEN_PROXIMO_KM km o menos; basta uno. Solo se evalúan los umbrales que
 * existan. No modifica `esVencido`: lo vencido nunca es próximo.
 */
export function esProximo(mantenimiento, kmActual, hoy = hoyLocal()) {
  if (mantenimiento.status !== 'PENDING' || esVencido(mantenimiento, kmActual, hoy)) {
    return false;
  }
  const dias = diasRestantes(mantenimiento.targetDate, hoy);
  if (dias != null && dias <= MARGEN_PROXIMO_DIAS) {
    return true;
  }
  const km = kmRestantes(mantenimiento.targetMileage, kmActual);
  return km != null && km <= MARGEN_PROXIMO_KM;
}

/**
 * Proximidad del umbral más cercano (días o km); la menor de las medidas
 * disponibles ordena los pendientes en la lista de urgencia (research D9).
 */
export function proximidad(mantenimiento, kmActual, hoy = hoyLocal()) {
  const medidas = [
    diasRestantes(mantenimiento.targetDate, hoy),
    kmRestantes(mantenimiento.targetMileage, kmActual),
  ].filter((medida) => medida != null);
  if (medidas.length === 0) {
    return null;
  }
  return Math.min(...medidas);
}
