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

/**
 * Población de los reportes de servicios y productividad: «órdenes cerradas del
 * periodo» = `TERMINADO` o `ENTREGADO` con `status_changed_at` en el rango (las
 * canceladas y las que siguen en trabajo nunca cuentan). Usa
 * `idx_orders_status_changed (status, status_changed_at)`.
 */
const ORDENES_CERRADAS =
  "o.status IN ('TERMINADO', 'ENTREGADO') AND o.status_changed_at >= ? AND o.status_changed_at < ?";

/**
 * Líneas de servicio de las órdenes cerradas, agrupadas por tipo (`tipo` es
 * `null` para las líneas sin tipo): cantidad de líneas e importe en centavos.
 */
export async function findServicesByType({ desdeSql, hastaExclusivoSql }) {
  const [filas] = await getPool().query(
    `SELECT t.name AS tipo, COUNT(*) AS cantidad, CAST(ROUND(SUM(s.amount) * 100) AS SIGNED) AS centavos
     FROM service_orders o
     JOIN order_services s ON s.order_id = o.id
     LEFT JOIN service_types t ON t.id = s.service_type_id
     WHERE ${ORDENES_CERRADAS}
     GROUP BY t.id, t.name`,
    [desdeSql, hastaExclusivoSql]
  );
  return filas.map((fila) => ({ tipo: fila.tipo ?? null, cantidad: Number(fila.cantidad), centavos: Number(fila.centavos) }));
}

/**
 * Órdenes cerradas y mano de obra por mecánico (`id` y `nombre` son `null` sin
 * mecánico). La mano de obra de cada orden se suma en una subconsulta para no
 * multiplicar filas cuando una orden tiene varias líneas.
 */
export async function findProductivityByMechanic({ desdeSql, hastaExclusivoSql }) {
  const [filas] = await getPool().query(
    `SELECT o.mechanic_id AS id, u.full_name AS nombre, COUNT(*) AS ordenes,
            CAST(ROUND(SUM((SELECT COALESCE(SUM(l.amount), 0) FROM order_labor l WHERE l.order_id = o.id)) * 100) AS SIGNED) AS centavos
     FROM service_orders o
     LEFT JOIN users u ON u.id = o.mechanic_id
     WHERE ${ORDENES_CERRADAS}
     GROUP BY o.mechanic_id, u.full_name`,
    [desdeSql, hastaExclusivoSql]
  );
  return filas.map((fila) => ({
    id: fila.id ?? null,
    nombre: fila.nombre ?? null,
    ordenes: Number(fila.ordenes),
    centavos: Number(fila.centavos),
  }));
}
