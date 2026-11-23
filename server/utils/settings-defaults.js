/**
 * Claves, valores de respaldo y límites de la configuración
 * (008-configuracion-seguridad-reportes, T011; FR-001, FR-004, FR-005, CA-3).
 *
 * Los valores de respaldo repiten exactamente las constantes que había antes en
 * el código (`TALLER` en `ticket-service.js`, `MARGEN_PROXIMO_*` y
 * `DIAS_ORDEN_DETENIDA` del Sprint 6 y los 30 minutos de la sesión), de modo que
 * una instalación sin configuración guardada se comporta como antes. Funciones
 * puras, sin acceso a la base de datos.
 */

/** Claves de la tabla `settings` (data-model.md, sección 1). */
export const CLAVES = Object.freeze({
  NOMBRE: 'shop.name',
  DIRECCION: 'shop.address',
  TELEFONO: 'shop.phone',
  MARGEN_DIAS: 'maintenance.margin_days',
  MARGEN_KM: 'maintenance.margin_km',
  DIAS_ORDEN_DETENIDA: 'orders.stalled_days',
  MINUTOS_INACTIVIDAD: 'session.inactivity_minutes',
});

/** Valor que se usa cuando una clave no está guardada o su valor es inválido. */
export const VALORES_RESPALDO = Object.freeze({
  [CLAVES.NOMBRE]: 'Motorix',
  [CLAVES.DIRECCION]: 'Av. Taller 123, Col. Centro',
  [CLAVES.TELEFONO]: '555-000-0000',
  [CLAVES.MARGEN_DIAS]: 30,
  [CLAVES.MARGEN_KM]: 1000,
  [CLAVES.DIAS_ORDEN_DETENIDA]: 3,
  [CLAVES.MINUTOS_INACTIVIDAD]: 30,
});

/** Límites inclusivos [mínimo, máximo] de los ajustes numéricos. */
export const LIMITES = Object.freeze({
  [CLAVES.MARGEN_DIAS]: Object.freeze([1, 365]),
  [CLAVES.MARGEN_KM]: Object.freeze([100, 50000]),
  [CLAVES.DIAS_ORDEN_DETENIDA]: Object.freeze([1, 90]),
  [CLAVES.MINUTOS_INACTIVIDAD]: Object.freeze([5, 120]),
});

/** Longitudes máximas de los textos del taller. */
export const LONGITUD_MAXIMA = Object.freeze({
  [CLAVES.NOMBRE]: 100,
  [CLAVES.DIRECCION]: 150,
  [CLAVES.TELEFONO]: 30,
});

/** Caracteres permitidos en el teléfono: dígitos, espacios, `+`, `-`, `(` y `)`. */
export const TELEFONO_PERMITIDO = /^[0-9+\-\s()]*$/;

/** ¿El valor es un entero dentro de los límites de la clave? */
export function enteroEnLimites(clave, valor) {
  const [minimo, maximo] = LIMITES[clave];
  return Number.isInteger(valor) && valor >= minimo && valor <= maximo;
}

/**
 * Valor efectivo de una clave a partir del texto guardado en la base: si falta,
 * está vacío (en el nombre) o es inválido (no entero o fuera de límites) se usa
 * el valor de respaldo, de modo que un dato corrupto nunca rompe el servidor.
 */
export function resolverValor(clave, textoGuardado) {
  const respaldo = VALORES_RESPALDO[clave];
  if (textoGuardado === undefined || textoGuardado === null) {
    return respaldo;
  }

  if (LIMITES[clave]) {
    const texto = String(textoGuardado).trim();
    if (!/^\d+$/.test(texto)) {
      return respaldo;
    }
    const numero = Number(texto);
    return enteroEnLimites(clave, numero) ? numero : respaldo;
  }

  const texto = String(textoGuardado).trim();
  if (clave === CLAVES.NOMBRE) {
    return texto.length > 0 && texto.length <= LONGITUD_MAXIMA[clave] ? texto : respaldo;
  }
  // Dirección y teléfono pueden quedar vacíos; si exceden su longitud, respaldo.
  return texto.length <= LONGITUD_MAXIMA[clave] ? texto : respaldo;
}
