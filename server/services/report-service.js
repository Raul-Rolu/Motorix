/**
 * Servicio de reportes (008-configuracion-seguridad-reportes, T116; FR-023,
 * FR-024, CA-7). Solo ADMIN los consulta (validado en el ruteador, RN-15). Cada
 * función devuelve UNA estructura que usan tanto la respuesta JSON como, más
 * adelante, la exportación a CSV, de modo que pantalla y archivo coincidan.
 *
 * Los importes se calculan y se suman en centavos enteros (`aCentavos` /
 * `deCentavos` de `utils/money.js`); los pesos solo son la presentación.
 */
import * as reportModel from '../models/report.js';
import { agrupacionDe } from '../utils/report-range.js';
import { deCentavos } from '../utils/money.js';

const aImporte = (centavos) => ({ totalCentavos: centavos, total: deCentavos(centavos) });

/**
 * Ingresos del rango: solo pagos COMPLETED (el mismo criterio del panel de
 * control), por periodo (día hasta 62 días; mes con más) y por método.
 * @param {{ desde: string, hasta: string, desdeSql: string, hastaExclusivoSql: string, dias: number }} rango
 */
export async function ingresos(rango) {
  const agrupacion = agrupacionDe(rango);
  const [metodos, periodos] = await Promise.all([
    reportModel.findIncomeByMethod(rango),
    reportModel.findIncomeByPeriod(rango, agrupacion),
  ]);

  const porMetodo = metodos
    .map(({ metodo, centavos }) => ({ metodo, ...aImporte(centavos) }))
    .sort((a, b) => b.totalCentavos - a.totalCentavos || a.metodo.localeCompare(b.metodo));
  const porPeriodo = periodos.map(({ periodo, centavos }) => ({ periodo, ...aImporte(centavos) }));
  const totalCentavos = porMetodo.reduce((suma, fila) => suma + fila.totalCentavos, 0);

  return {
    rango: { desde: rango.desde, hasta: rango.hasta },
    agrupacion,
    ...aImporte(totalCentavos),
    porPeriodo,
    porMetodo,
  };
}
