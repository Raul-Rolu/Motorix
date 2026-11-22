/**
 * Acceso a datos de avisos internos (007-notificaciones-internas, T041).
 *
 * Los avisos no se almacenan (RN-10): aquí solo viven las consultas propias de
 * los avisos que no existían (órdenes detenidas) y, en US6, la lectura por
 * usuario. Los demás avisos reutilizan las consultas de sus módulos.
 */
import { getPool } from '../config/db.js';

/** Estados en los que una orden puede estar detenida (nunca TERMINADO, ENTREGADO ni CANCELADA). */
export const ESTADOS_ORDEN_ACTIVOS = Object.freeze([
  'RECIBIDO',
  'DIAGNOSTICO',
  'EN_REPARACION',
  'ESPERANDO_REFACCION',
]);

/**
 * Órdenes activas cuyo último cambio de estado (`status_changed_at`) fue hace
 * MÁS de `dias` días (FR-010). Con `mechanicId` solo las asignadas a ese
 * mecánico (una orden sin mecánico no se devuelve a ningún mecánico).
 * Orden: la más antigua primero.
 */
export async function findOrdenesDetenidas({ dias, mechanicId = null }) {
  const parametros = [ESTADOS_ORDEN_ACTIVOS, dias];
  let filtroMecanico = '';
  if (mechanicId != null) {
    filtroMecanico = 'AND o.mechanic_id = ?';
    parametros.push(mechanicId);
  }
  const [filas] = await getPool().query(
    `SELECT o.id, o.status, o.mechanic_id, v.plates,
            TIMESTAMPDIFF(HOUR, o.status_changed_at, NOW()) AS horas_sin_cambio,
            TIMESTAMPDIFF(DAY, o.status_changed_at, NOW()) AS dias_sin_cambio
     FROM service_orders o
     JOIN vehicles v ON v.id = o.vehicle_id
     WHERE o.status IN (?) AND o.status_changed_at < DATE_SUB(NOW(), INTERVAL ? DAY)
       ${filtroMecanico}
     ORDER BY o.status_changed_at ASC, o.id ASC`,
    parametros
  );
  return filas.map((fila) => ({
    id: fila.id,
    status: fila.status,
    mechanicId: fila.mechanic_id,
    plates: fila.plates,
    horasSinCambio: Number(fila.horas_sin_cambio),
    diasSinCambio: Number(fila.dias_sin_cambio),
  }));
}
