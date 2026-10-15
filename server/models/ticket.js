/**
 * Acceso a datos de tickets de servicio (Sprint 4, T033, US3).
 *
 * Un ticket por orden (UNIQUE en order_id): reutilizar el mismo folio al
 * regenerar evita duplicar comprobantes (research D4). El contenido NO se
 * persiste: se deriva al consultar desde la orden y sus pagos (FR-015, CA-4);
 * aquí solo vive el folio y su trazabilidad de emisión.
 */
import { getPool } from '../config/db.js';

export function aObjeto(fila) {
  if (!fila) {
    return null;
  }
  return {
    id: fila.id,
    orderId: fila.order_id,
    folio: fila.folio,
    issuedBy: fila.issued_by ?? null,
    issuedAt: fila.issued_at,
  };
}

/** Ticket de una orden, si ya fue emitido (folio reutilizable). */
export async function findByOrder(orderId) {
  const [filas] = await getPool().query(
    'SELECT * FROM tickets WHERE order_id = ?',
    [orderId]
  );
  return aObjeto(filas[0]);
}

/** Emite el ticket con su folio (idempotente por la UNIQUE de order_id). */
export async function create({ orderId, folio, issuedBy = null }) {
  const [resultado] = await getPool().query(
    'INSERT INTO tickets (order_id, folio, issued_by) VALUES (?, ?, ?)',
    [orderId, folio, issuedBy]
  );
  const [filas] = await getPool().query('SELECT * FROM tickets WHERE id = ?', [
    resultado.insertId,
  ]);
  return aObjeto(filas[0]);
}

/** Cantidad de tickets emitidos en un año (siguiente secuencia del folio). */
export async function countByYear(anio) {
  const [filas] = await getPool().query(
    "SELECT COUNT(*) AS total FROM tickets WHERE folio LIKE CONCAT('TCK-', ?, '-%')",
    [String(anio)]
  );
  return Number(filas[0].total);
}
