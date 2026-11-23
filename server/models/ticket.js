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
    // 008-configuracion-seguridad-reportes (FR-003): instantánea del taller al
    // emitir. Los tickets anteriores al sprint la tienen en null (sin relleno);
    // `shopName` no nulo es el marcador de «ticket con instantánea».
    shopName: fila.shop_name ?? null,
    shopAddress: fila.shop_address ?? null,
    shopPhone: fila.shop_phone ?? null,
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

/**
 * Emite el ticket con su folio (idempotente por la UNIQUE de order_id) y la
 * instantánea del taller vigente al emitirlo (008, FR-003). El contenido
 * (importes, líneas, pagos) NO se guarda: se deriva al consultar.
 */
export async function create({ orderId, folio, issuedBy = null, taller = null }) {
  const [resultado] = await getPool().query(
    'INSERT INTO tickets (order_id, folio, issued_by, shop_name, shop_address, shop_phone) VALUES (?, ?, ?, ?, ?, ?)',
    [orderId, folio, issuedBy, taller?.nombre ?? null, taller?.direccion ?? null, taller?.telefono ?? null]
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
