/**
 * Acceso a datos de pagos (Sprint 4, T007, US1/US2/US4).
 * Pagos inmutables (FR-006): no se editan ni se eliminan; la única escritura
 * posterior al alta es la transición única de estado PENDING → COMPLETED /
 * PENDING → EXPIRED (research D1). Nunca se guardan datos de tarjeta
 * (RN-14): external_reference es solo el identificador de la preferencia
 * creada ante el proveedor (research D8).
 */
import { getPool } from '../config/db.js';

/** Horas tras las cuales un cobro digital no confirmado caduca (FR-009). */
export const HORAS_CADUCIDAD_DIGITAL = 24;

export function aObjeto(fila) {
  if (!fila) {
    return null;
  }
  return {
    id: fila.id,
    orderId: fila.order_id,
    method: fila.method,
    amount: Number(fila.amount),
    status: fila.status,
    externalReference: fila.external_reference ?? null,
    createdBy: fila.created_by ?? null,
    createdByName: fila.creator_name ?? null,
    createdAt: fila.created_at,
  };
}

/** Pagos de una orden, más recientes primero (US1). */
export async function findByOrder(orderId) {
  const [filas] = await getPool().query(
    `SELECT p.*, u.full_name AS creator_name
     FROM payments p
     LEFT JOIN users u ON u.id = p.created_by
     WHERE p.order_id = ?
     ORDER BY p.created_at DESC, p.id DESC`,
    [orderId]
  );
  return filas.map(aObjeto);
}

export async function findById(id) {
  const [filas] = await getPool().query(
    `SELECT p.*, u.full_name AS creator_name
     FROM payments p
     LEFT JOIN users u ON u.id = p.created_by
     WHERE p.id = ?`,
    [id]
  );
  return aObjeto(filas[0]);
}

/** Alta inmutable: el estado nace COMPLETED (manual) o PENDING (digital, D1). */
export async function create({
  orderId,
  method,
  amount,
  status,
  externalReference = null,
  createdBy = null,
}) {
  const [resultado] = await getPool().query(
    `INSERT INTO payments (order_id, method, amount, status, external_reference, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [orderId, method, amount, status, externalReference, createdBy]
  );
  return findById(resultado.insertId);
}

/**
 * Transición única de estado (FR-010): solo desde PENDING y como máximo una
 * vez; los reintentos del proveedor no pueden duplicar el importe.
 */
export async function transitionFromPending(id, status) {
  const [resultado] = await getPool().query(
    'UPDATE payments SET status = ? WHERE id = ? AND status = ?',
    [status, id, 'PENDING']
  );
  return resultado.affectedRows > 0;
}

/** Cobro digital vigente (PENDING) de la orden, si existe (PAYMENT_DUPLICATE_PENDING). */
export async function findPendingDigitalByOrder(orderId, excluirId = null) {
  const [filas] = await getPool().query(
    `SELECT * FROM payments
     WHERE order_id = ? AND status = 'PENDING' AND method = 'MERCADO_PAGO' AND id <> ?`,
    [orderId, excluirId ?? 0]
  );
  return aObjeto(filas[0]);
}

/** Suma de los pagos COMPLETED de una orden (liquidación, FR-004). */
export async function sumCompletedByOrder(orderId) {
  const [filas] = await getPool().query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
     WHERE order_id = ? AND status = 'COMPLETED'`,
    [orderId]
  );
  return Number(filas[0].total);
}

/**
 * Expiración perezosa de los cobros digitales no confirmados (FR-009,
 * research D3): sin cron; se aplica al consultar o verificar.
 */
export async function expireStaleDigital(orderId) {
  await getPool().query(
    `UPDATE payments
     SET status = 'EXPIRED'
     WHERE order_id = ? AND status = 'PENDING' AND method = 'MERCADO_PAGO'
       AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [orderId, HORAS_CADUCIDAD_DIGITAL]
  );
}

/** Dinero cobrado de hoy (solo COMPLETED; los pendientes/expirados no cuentan). */
export async function sumCompletedToday() {
  const [filas] = await getPool().query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments
     WHERE status = 'COMPLETED' AND DATE(created_at) = CURDATE()`
  );
  return Number(filas[0].total);
}

/** Dinero cobrado acumulado (solo COMPLETED; FR-009, SC-007). */
export async function sumCompletedTotal() {
  const [filas] = await getPool().query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'COMPLETED'`
  );
  return Number(filas[0].total);
}

/**
 * Expiración perezosa GLOBAL de los cobros digitales no confirmados (FR-009,
 * research D3): sin cron; se aplica al consultar el panel de control antes
 * de contar los pendientes.
 */
export async function expireStaleDigitalGlobal() {
  await getPool().query(
    `UPDATE payments
     SET status = 'EXPIRED'
     WHERE status = 'PENDING' AND method = 'MERCADO_PAGO'
       AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
    [HORAS_CADUCIDAD_DIGITAL]
  );
}

/** Cobros digitales vigentes (para el indicador de pendientes del panel). */
export async function countPendingDigital() {
  const [filas] = await getPool().query(
    `SELECT COUNT(*) AS total FROM payments
     WHERE status = 'PENDING' AND method = 'MERCADO_PAGO'`
  );
  return Number(filas[0].total);
}
