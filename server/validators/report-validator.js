/**
 * Validación de las consultas de los reportes (008-configuracion-seguridad-
 * reportes, T111; FR-023, FR-028, CA-6, CA-11). Funciones puras con mensajes en
 * español: el rango (ver `utils/report-range.js`), la paginación y el nombre del
 * reporte a exportar.
 */
import { resolverRango } from '../utils/report-range.js';

/** Reportes disponibles (el nombre también es el de la ruta de exportación). */
export const REPORTES = Object.freeze(['income', 'services', 'productivity', 'parts', 'rotation']);

export const LIMITE_POR_DEFECTO = 50;
export const LIMITE_MAXIMO = 100;

const ENTERO_POSITIVO = /^[1-9][0-9]{0,8}$/;

/** Rango del reporte: `{ errores, rango }`. */
export function validarRangoDeReporte(consulta, hoy = new Date()) {
  return resolverRango(consulta, hoy);
}

/**
 * `pagina` (por omisión 1) y `limite` (por omisión 50, de 1 a 100).
 * @returns {{ errores: string[], pagina: number, limite: number }}
 */
export function validarPaginacion(consulta = {}) {
  const errores = [];
  let pagina = 1;
  let limite = LIMITE_POR_DEFECTO;

  if (consulta.pagina !== undefined) {
    if (typeof consulta.pagina === 'string' && ENTERO_POSITIVO.test(consulta.pagina)) {
      pagina = Number(consulta.pagina);
    } else {
      errores.push('La página (pagina) debe ser un número entero mayor que cero.');
    }
  }
  if (consulta.limite !== undefined) {
    const valido =
      typeof consulta.limite === 'string' &&
      ENTERO_POSITIVO.test(consulta.limite) &&
      Number(consulta.limite) <= LIMITE_MAXIMO;
    if (valido) {
      limite = Number(consulta.limite);
    } else {
      errores.push(`El límite (limite) debe ser un número entero entre 1 y ${LIMITE_MAXIMO}.`);
    }
  }
  return { errores, pagina, limite };
}

/** ¿Es el nombre de uno de los cinco reportes? (comparación exacta, sin heredar de `Object`). */
export function esReporteValido(nombre) {
  return typeof nombre === 'string' && REPORTES.includes(nombre);
}
