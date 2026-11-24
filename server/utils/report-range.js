/**
 * Rango de fechas de los reportes (008-configuracion-seguridad-reportes, T107;
 * FR-023, CA-6). Funciones puras en hora LOCAL del servidor, sin base de datos.
 *
 * El rango se indica con `desde` y `hasta` (`AAAA-MM-DD`, ambos INCLUSIVOS) o con
 * `periodo` (`MES_ACTUAL` o `MES_ANTERIOR`, siempre el mes completo). Mezclar
 * `periodo` con `desde` o `hasta` es ambiguo y se rechaza. El máximo es de 366
 * días. Para filtrar en SQL se devuelven `desdeSql` (inclusivo) y
 * `hastaExclusivoSql` (el día siguiente a las 00:00:00), de modo que un rango de
 * un solo día es `created_at >= desdeSql AND created_at < hastaExclusivoSql`.
 */

/** Máximo de días (inclusivos) de un reporte. */
export const MAXIMO_DIAS = 366;

/** Hasta este número de días, el reporte de ingresos agrupa por día; con más, por mes. */
export const MAXIMO_DIAS_POR_DIA = 62;

const PERIODOS = ['MES_ACTUAL', 'MES_ANTERIOR'];
const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_POR_DIA = 86_400_000;

const dos = (n) => String(n).padStart(2, '0');
const texto = (anio, mes, dia) => `${anio}-${dos(mes)}-${dos(dia)}`;

/** Interpreta `AAAA-MM-DD` como fecha real; devuelve `{anio, mes, dia}` o `null`. */
function leerFecha(valor) {
  if (typeof valor !== 'string') return null;
  const partes = FORMATO_FECHA.exec(valor);
  if (!partes) return null;
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
    return null;
  }
  return { anio, mes, dia };
}

/** Número de día absoluto de una fecha (en UTC, para restar sin efectos del huso). */
const diaAbsoluto = ({ anio, mes, dia }) => Date.UTC(anio, mes - 1, dia) / MS_POR_DIA;

/** Texto `AAAA-MM-DD` del día siguiente. */
function diaSiguiente({ anio, mes, dia }) {
  const siguiente = new Date(Date.UTC(anio, mes - 1, dia + 1));
  return texto(siguiente.getUTCFullYear(), siguiente.getUTCMonth() + 1, siguiente.getUTCDate());
}

/** Construye el objeto de rango a partir de dos fechas ya validadas. */
function construirRango(inicio, fin) {
  return {
    desde: texto(inicio.anio, inicio.mes, inicio.dia),
    hasta: texto(fin.anio, fin.mes, fin.dia),
    desdeSql: `${texto(inicio.anio, inicio.mes, inicio.dia)} 00:00:00`,
    hastaExclusivoSql: `${diaSiguiente(fin)} 00:00:00`,
    dias: diaAbsoluto(fin) - diaAbsoluto(inicio) + 1,
  };
}

/** Mes completo `desplazamiento` meses respecto de «hoy» (0 = actual, -1 = anterior). */
function mesCompleto(hoy, desplazamiento) {
  const primero = new Date(hoy.getFullYear(), hoy.getMonth() + desplazamiento, 1);
  const ultimo = new Date(primero.getFullYear(), primero.getMonth() + 1, 0);
  return construirRango(
    { anio: primero.getFullYear(), mes: primero.getMonth() + 1, dia: 1 },
    { anio: ultimo.getFullYear(), mes: ultimo.getMonth() + 1, dia: ultimo.getDate() }
  );
}

/**
 * Resuelve y valida el rango de una consulta de reporte.
 * @param {{ desde?: unknown, hasta?: unknown, periodo?: unknown }} [consulta]
 * @param {Date} [hoy] «Hoy» local (inyectable en las pruebas).
 * @returns {{ errores: string[], rango: null | { desde: string, hasta: string,
 *   desdeSql: string, hastaExclusivoSql: string, dias: number } }}
 */
export function resolverRango(consulta, hoy = new Date()) {
  const { desde, hasta, periodo } = consulta ?? {};
  const hayDesde = desde !== undefined;
  const hayHasta = hasta !== undefined;
  const hayPeriodo = periodo !== undefined;

  if (hayPeriodo && (hayDesde || hayHasta)) {
    return {
      errores: ['Indique el periodo o bien las fechas desde y hasta, no ambos.'],
      rango: null,
    };
  }

  if (hayPeriodo) {
    if (typeof periodo !== 'string' || !PERIODOS.includes(periodo)) {
      return { errores: ['El periodo debe ser MES_ACTUAL o MES_ANTERIOR.'], rango: null };
    }
    return { errores: [], rango: mesCompleto(hoy, periodo === 'MES_ACTUAL' ? 0 : -1) };
  }

  if (!hayDesde && !hayHasta) {
    return {
      errores: ['Indique el rango del reporte: las fechas desde y hasta (AAAA-MM-DD) o un periodo.'],
      rango: null,
    };
  }

  const errores = [];
  if (!hayDesde) errores.push('Falta la fecha inicial (desde).');
  if (!hayHasta) errores.push('Falta la fecha final (hasta).');
  const inicio = hayDesde ? leerFecha(desde) : null;
  const fin = hayHasta ? leerFecha(hasta) : null;
  if (hayDesde && !inicio) errores.push('La fecha inicial (desde) debe ser una fecha válida con el formato AAAA-MM-DD.');
  if (hayHasta && !fin) errores.push('La fecha final (hasta) debe ser una fecha válida con el formato AAAA-MM-DD.');
  if (errores.length > 0) return { errores, rango: null };

  if (diaAbsoluto(fin) < diaAbsoluto(inicio)) {
    return { errores: ['La fecha final (hasta) no puede ser anterior a la inicial (desde).'], rango: null };
  }
  const rango = construirRango(inicio, fin);
  if (rango.dias > MAXIMO_DIAS) {
    return { errores: [`El rango no puede exceder ${MAXIMO_DIAS} días.`], rango: null };
  }
  return { errores: [], rango };
}

/** Agrupación del reporte de ingresos: por día hasta 62 días y por mes con más. */
export function agrupacionDe(rango) {
  return rango.dias <= MAXIMO_DIAS_POR_DIA ? 'DIA' : 'MES';
}
