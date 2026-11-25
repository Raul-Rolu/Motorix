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

/**
 * Usos de refacciones de las órdenes cerradas del periodo (una fila por línea de
 * `order_parts`), con el precio de venta CONGELADO del uso y el precio de compra
 * VIGENTE de la refacción (el sistema no guarda el costo por uso). Los precios
 * salen en centavos enteros y nulos cuando faltan (nunca 0 por omisión). Las
 * refacciones inactivas se incluyen: son usos históricos. Más reciente primero.
 */
export async function findPartUsages({ desdeSql, hastaExclusivoSql }, { limite, desplazamiento }) {
  const [filas] = await getPool().query(
    `SELECT op.id AS uso_id, o.id AS orden_id, p.id AS parte_id, p.code AS codigo, p.name AS nombre,
            op.quantity AS cantidad,
            CAST(ROUND(op.unit_price * 100) AS SIGNED) AS venta_centavos,
            CAST(ROUND(p.purchase_price * 100) AS SIGNED) AS compra_centavos
     FROM service_orders o
     JOIN order_parts op ON op.order_id = o.id
     JOIN parts p ON p.id = op.part_id
     WHERE ${ORDENES_CERRADAS}
     ORDER BY o.status_changed_at DESC, op.id DESC
     LIMIT ? OFFSET ?`,
    [desdeSql, hastaExclusivoSql, limite, desplazamiento]
  );
  return filas.map((fila) => ({
    ordenId: fila.orden_id,
    parteId: fila.parte_id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    cantidad: Number(fila.cantidad),
    ventaCentavos: fila.venta_centavos === null ? null : Number(fila.venta_centavos),
    compraCentavos: fila.compra_centavos === null ? null : Number(fila.compra_centavos),
  }));
}

/**
 * Totales de TODOS los usos del rango (no solo de la página): número de líneas,
 * líneas sin costo y sin precio, y ventas y costo en centavos SOLO de las líneas
 * completas (con precio de venta y de compra), de modo que margen = ventas − costo.
 */
export async function summarizePartUsages({ desdeSql, hastaExclusivoSql }) {
  const [[fila]] = await getPool().query(
    `SELECT COUNT(*) AS lineas,
            COALESCE(SUM(p.purchase_price IS NULL), 0) AS sin_costo,
            COALESCE(SUM(op.unit_price IS NULL), 0) AS sin_precio,
            CAST(ROUND(COALESCE(SUM(CASE WHEN op.unit_price IS NOT NULL AND p.purchase_price IS NOT NULL
                                         THEN op.unit_price * op.quantity END), 0) * 100) AS SIGNED) AS ventas,
            CAST(ROUND(COALESCE(SUM(CASE WHEN op.unit_price IS NOT NULL AND p.purchase_price IS NOT NULL
                                         THEN p.purchase_price * op.quantity END), 0) * 100) AS SIGNED) AS costo
     FROM service_orders o
     JOIN order_parts op ON op.order_id = o.id
     JOIN parts p ON p.id = op.part_id
     WHERE ${ORDENES_CERRADAS}`,
    [desdeSql, hastaExclusivoSql]
  );
  return {
    lineas: Number(fila.lineas),
    sinCosto: Number(fila.sin_costo),
    sinPrecio: Number(fila.sin_precio),
    ventasCentavos: Number(fila.ventas),
    costoCentavos: Number(fila.costo),
  };
}

/**
 * Rotación: por refacción ACTIVA, las unidades de salida (`OUT`) del rango y la
 * existencia actual. Orden en SQL (para paginar): con existencia primero, por
 * salidas ÷ existencia descendente, y luego por nombre; las agotadas al final.
 */
export async function findRotation({ desdeSql, hastaExclusivoSql }, { limite, desplazamiento }) {
  const [filas] = await getPool().query(
    `SELECT p.id AS parte_id, p.code AS codigo, p.name AS nombre, p.stock AS existencia,
            COALESCE(m.unidades, 0) AS unidades
     FROM parts p
     LEFT JOIN (
       SELECT part_id, SUM(ABS(quantity)) AS unidades
       FROM inventory_movements
       WHERE movement_type = 'OUT' AND created_at >= ? AND created_at < ?
       GROUP BY part_id
     ) m ON m.part_id = p.id
     WHERE p.is_active = 1
     ORDER BY (p.stock = 0) ASC, COALESCE(m.unidades, 0) / NULLIF(p.stock, 0) DESC, p.name ASC, p.id ASC
     LIMIT ? OFFSET ?`,
    [desdeSql, hastaExclusivoSql, limite, desplazamiento]
  );
  return filas.map((fila) => ({
    parteId: fila.parte_id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    existencia: Number(fila.existencia),
    unidades: Number(fila.unidades),
  }));
}

/** Número de refacciones activas (para paginar la rotación). */
export async function countActiveParts() {
  const [[fila]] = await getPool().query('SELECT COUNT(*) AS total FROM parts WHERE is_active = 1');
  return Number(fila.total);
}
