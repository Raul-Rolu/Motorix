/**
 * Acceso a datos de movimientos de inventario (Sprint 3, T036, US5/US7).
 *
 * Control atómico de stock (RN-6/RN-7/RN-8, research D4): cada movimiento se
 * aplica en una transacción con `SELECT ... FOR UPDATE` sobre `parts`, de
 * modo que dos salidas simultáneas jamás dejan el stock negativo. Las
 * funciones reciben la conexión de la transacción abierta por el servicio
 * (o por order-service en el flujo de refacciones de una orden, US7).
 */
import { getPool } from '../config/db.js';
import { errores } from '../utils/errors.js';

/** Ejecuta `fn` dentro de una transacción con una conexión exclusiva. */
export async function conTransaccion(fn) {
  const conexion = await getPool().getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await fn(conexion);
    await conexion.commit();
    return resultado;
  } catch (error) {
    await conexion.rollback();
    throw error;
  } finally {
    conexion.release();
  }
}

/** Bloquea la fila de la refacción para escritura (FOR UPDATE). */
export async function bloquearParte(conexion, partId) {
  const [filas] = await conexion.query(
    'SELECT id, name, stock, is_active, sale_price FROM parts WHERE id = ? FOR UPDATE',
    [partId]
  );
  if (filas.length === 0) {
    throw errores.parteNoEncontrada();
  }
  return {
    id: filas[0].id,
    name: filas[0].name,
    stock: Number(filas[0].stock),
    isActive: Boolean(filas[0].is_active),
    // Precio de venta vigente (005, FR-004): null = pendiente de precio.
    salePrice:
      filas[0].sale_price === null || filas[0].sale_price === undefined
        ? null
        : Number(filas[0].sale_price),
  };
}

/**
 * Aplica un movimiento dentro de la transacción abierta (sin bloquear de
 * nuevo): calcula el delta, valida que el stock resultante no sea negativo
 * (RN-8 uniforme, aclaración Q3: también el AJUSTE), actualiza `parts` y
 * registra la línea en `inventory_movements`. Devuelve `stockResult`.
 */
export async function aplicarMovimiento(
  conexion,
  { partId, movementType, quantity, orderId = null, reason, createdBy }
) {
  const [filas] = await conexion.query(
    'SELECT stock FROM parts WHERE id = ? FOR UPDATE',
    [partId]
  );
  if (filas.length === 0) {
    throw errores.parteNoEncontrada();
  }
  const stockActual = Number(filas[0].stock);

  let delta;
  if (movementType === 'IN') {
    delta = Math.abs(quantity);
  } else if (movementType === 'OUT') {
    delta = -Math.abs(quantity);
  } else {
    delta = quantity; // ADJUSTMENT: con signo explícito
  }

  const stockResult = stockActual + delta;
  if (stockResult < 0) {
    if (movementType === 'OUT') {
      throw errores.parteSinStock(stockActual, Math.abs(quantity));
    }
    throw errores.movimientoInvalido(
      `El ajuste dejaría el stock en ${stockResult}, que no puede ser negativo.`
    );
  }

  await conexion.query('UPDATE parts SET stock = ? WHERE id = ?', [
    stockResult,
    partId,
  ]);
  const [resultado] = await conexion.query(
    `INSERT INTO inventory_movements
       (part_id, movement_type, quantity, order_id, reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [partId, movementType, quantity, orderId, reason, createdBy ?? null]
  );

  return { movementId: resultado.insertId, stockResult };
}

/**
 * Auditoría de movimientos de una refacción (FR-009, US6): tipo, cantidad,
 * motivo, fecha y autor.
 */
export async function listarMovimientos(partId) {
  const [filas] = await getPool().query(
    `SELECT m.id, m.movement_type, m.quantity, m.order_id, m.reason,
            m.created_at, u.full_name AS created_by_name
     FROM inventory_movements m
     LEFT JOIN users u ON u.id = m.created_by
     WHERE m.part_id = ?
     ORDER BY m.created_at DESC, m.id DESC`,
    [partId]
  );
  return filas.map((fila) => ({
    id: fila.id,
    movementType: fila.movement_type,
    quantity: fila.quantity,
    orderId: fila.order_id,
    reason: fila.reason,
    createdAt: fila.created_at,
    createdBy: fila.created_by_name,
  }));
}

/** Acumulado de movimientos de una refacción (validación SC-004 en pruebas). */
export async function stockAcumulado(partId) {
  const [[fila]] = await getPool().query(
    'SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory_movements WHERE part_id = ?',
    [partId]
  );
  return Number(fila.total);
}
