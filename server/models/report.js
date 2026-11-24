/**
 * Consultas de los reportes (008-configuracion-seguridad-reportes, T116; FR-023,
 * FR-024, CA-7). Solo lectura: agregación en SQL, sin consultas por fila, sobre
 * los datos existentes y sin tablas de resumen. Todos los importes salen en
 * CENTAVOS ENTEROS (`DECIMAL` exacto × 100 → entero) para que el servicio no
 * sume coma flotante.
 *
 * El rango llega ya validado (`utils/report-range.js`): `desdeSql` inclusivo y
 * `hastaExclusivoSql` exclusivo, en la misma hora local que guarda MySQL.
 */
import { getPool } from '../config/db.js';

/** Ingresos por método: solo pagos COMPLETED del rango. */
export async function findIncomeByMethod({ desdeSql, hastaExclusivoSql }) {
  const [filas] = await getPool().query(
    `SELECT method AS metodo, CAST(ROUND(SUM(amount) * 100) AS SIGNED) AS centavos
     FROM payments
     WHERE status = 'COMPLETED' AND created_at >= ? AND created_at < ?
     GROUP BY method`,
    [desdeSql, hastaExclusivoSql]
  );
  return filas.map((fila) => ({ metodo: fila.metodo, centavos: Number(fila.centavos) }));
}

/**
 * Ingresos por día (`DIA`, periodo `AAAA-MM-DD`) o por mes (`MES`, `AAAA-MM`), en
 * orden cronológico y solo con los periodos que tienen pagos.
 */
export async function findIncomeByPeriod({ desdeSql, hastaExclusivoSql }, agrupacion) {
  // Los dos formatos son constantes del código (nunca texto del usuario).
  const consulta =
    agrupacion === 'DIA'
      ? `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS periodo, CAST(ROUND(SUM(amount) * 100) AS SIGNED) AS centavos
         FROM payments
         WHERE status = 'COMPLETED' AND created_at >= ? AND created_at < ?
         GROUP BY periodo ORDER BY periodo ASC`
      : `SELECT DATE_FORMAT(created_at, '%Y-%m') AS periodo, CAST(ROUND(SUM(amount) * 100) AS SIGNED) AS centavos
         FROM payments
         WHERE status = 'COMPLETED' AND created_at >= ? AND created_at < ?
         GROUP BY periodo ORDER BY periodo ASC`;
  const [filas] = await getPool().query(consulta, [desdeSql, hastaExclusivoSql]);
  return filas.map((fila) => ({ periodo: fila.periodo, centavos: Number(fila.centavos) }));
}
