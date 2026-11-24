/**
 * Acceso a datos de la bitácora (008-configuracion-seguridad-reportes, T069;
 * FR-011, FR-014, CA-20).
 *
 * Solo hay `INSERT` y `SELECT` paginado con filtros: este modelo NO ofrece
 * ninguna función para actualizar ni borrar entradas, y la aplicación no
 * expone esas operaciones (la bitácora no se edita ni se purga).
 */
import { getPool } from '../config/db.js';

/** Inserta una entrada. `userId` es null cuando no hay cuenta (inicio de sesión fallido de un usuario inexistente). */
export async function insert({ userId = null, action, entityType, entityId = null, detail = null }) {
  await getPool().query(
    'INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail) VALUES (?, ?, ?, ?, ?)',
    [userId, action, entityType, entityId, detail]
  );
}

/**
 * Una página de entradas (la más reciente primero) y el total con los mismos filtros.
 * `desde` y `hasta` son fechas `AAAA-MM-DD` inclusivas en hora local.
 */
export async function findPage({ desde = null, hasta = null, usuarioId = null, accion = null, limite, desplazamiento }) {
  const condiciones = [];
  const parametros = [];
  if (desde) {
    condiciones.push('a.created_at >= ?');
    parametros.push(`${desde} 00:00:00`);
  }
  if (hasta) {
    condiciones.push('a.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
    parametros.push(`${hasta} 00:00:00`);
  }
  if (usuarioId != null) {
    condiciones.push('a.user_id = ?');
    parametros.push(usuarioId);
  }
  if (accion) {
    condiciones.push('a.action = ?');
    parametros.push(accion);
  }
  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const [[{ total }]] = await getPool().query(
    `SELECT COUNT(*) AS total FROM audit_log a ${where}`,
    parametros
  );
  const [filas] = await getPool().query(
    `SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.detail, a.created_at,
            u.full_name AS user_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...parametros, limite, desplazamiento]
  );
  return {
    total: Number(total),
    filas: filas.map((fila) => ({
      id: fila.id,
      userId: fila.user_id,
      userName: fila.user_name ?? null,
      action: fila.action,
      entityType: fila.entity_type,
      entityId: fila.entity_id,
      detail: fila.detail,
      createdAt: fila.created_at,
    })),
  };
}
