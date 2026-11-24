/**
 * Serialización a CSV de los reportes (008-configuracion-seguridad-reportes,
 * T109; FR-027, CA-9). Funciones puras.
 *
 * - UTF-8 con BOM (`﻿`) para que Excel respete acentos y eñes.
 * - Filas separadas por `\r\n` (también la última).
 * - Celdas con coma, comillas o saltos de línea entre comillas dobles, con las
 *   comillas internas duplicadas.
 * - **Inyección de fórmulas**: toda celda de TEXTO que empiece con `=`, `+`, `-`,
 *   `@`, tabulador o retorno de carro se neutraliza anteponiéndole `'`, de modo que
 *   Excel y similares la traten como texto y no como una fórmula. Los números y los
 *   importes (`importeCsv`) no son texto y no se neutralizan: un margen negativo
 *   debe seguir siendo un número.
 * - Los importes se escriben desde centavos enteros, con punto y dos decimales.
 */

/** Marca de orden de bytes de UTF-8. */
export const BOM = '﻿';

const INICIOS_PELIGROSOS = new Set(['=', '+', '-', '@', '\t', '\r']);

/** Celda ya formateada (un importe) que no debe neutralizarse. */
class CeldaCruda {
  constructor(texto) {
    this.texto = texto;
  }
}

/**
 * Importe en pesos con punto y dos decimales a partir de centavos enteros. Un
 * valor nulo (por ejemplo, una línea «sin costo») sale como celda vacía.
 */
export function importeCsv(centavos) {
  if (centavos === null || centavos === undefined) {
    return new CeldaCruda('');
  }
  if (!Number.isSafeInteger(centavos)) {
    throw new TypeError('Los importes del CSV deben ser centavos enteros.');
  }
  const signo = centavos < 0 ? '-' : '';
  const absoluto = Math.abs(centavos);
  const pesos = Math.trunc(absoluto / 100);
  const resto = String(absoluto % 100).padStart(2, '0');
  return new CeldaCruda(`${signo}${pesos}.${resto}`);
}

/** Texto de una celda, con la neutralización de fórmulas aplicada a los textos. */
function aTexto(valor) {
  if (valor === null || valor === undefined) return { texto: '', neutralizable: false };
  if (valor instanceof CeldaCruda) return { texto: valor.texto, neutralizable: false };
  if (typeof valor === 'number') return { texto: String(valor), neutralizable: false };
  return { texto: String(valor), neutralizable: true };
}

/** Una celda lista para escribirse en el CSV. */
export function escaparCelda(valor) {
  const { texto: crudo, neutralizable } = aTexto(valor);
  const texto = neutralizable && crudo.length > 0 && INICIOS_PELIGROSOS.has(crudo[0]) ? `'${crudo}` : crudo;
  if (/[",\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

const fila = (celdas) => `${celdas.map(escaparCelda).join(',')}\r\n`;

/**
 * El CSV completo: BOM, encabezados y filas.
 * @param {string[]} encabezados
 * @param {unknown[][]} filas
 */
export function aCsv(encabezados, filas) {
  return BOM + fila(encabezados) + filas.map(fila).join('');
}
