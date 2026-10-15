/**
 * Agregados del panel de control (Sprint 4, T044, US4; research D7).
 *
 * Solo lectura: las cifras se calculan al vuelo sobre los datos existentes,
 * sin tablas de resumen ni campos derivados que pudieran quedar obsoletos.
 * Los cobros vienen del modelo de pagos (solo COMPLETED, FR-007 del spec).
 */
import { getPool } from '../config/db.js';

/** Todos los estados posibles de una orden, con cero por defecto. */
const ESTADOS_ORDEN = [
  'RECIBIDO',
  'DIAGNOSTICO',
  'EN_REPARACION',
  'ESPERANDO_REFACCION',
  'TERMINADO',
  'ENTREGADO',
  'CANCELADA',
];

/** Órdenes activas agrupadas por estado (FR-014). */
export async function contarOrdenesPorEstado() {
  const [filas] = await getPool().query(
    'SELECT status, COUNT(*) AS total FROM service_orders GROUP BY status'
  );
  const conteo = Object.fromEntries(ESTADOS_ORDEN.map((estado) => [estado, 0]));
  for (const fila of filas) {
    conteo[fila.status] = Number(fila.total);
  }
  return conteo;
}

/**
 * Citas de hoy (sin canceladas) y próximas (programadas futuras) (FR-014).
 * Las vencidas no se cuentan como próximas.
 */
export async function contarCitas() {
  const [hoy] = await getPool().query(
    "SELECT COUNT(*) AS total FROM appointments WHERE appointment_date = CURDATE() AND status <> 'CANCELADA'"
  );
  const [proximas] = await getPool().query(
    "SELECT COUNT(*) AS total FROM appointments WHERE appointment_date > CURDATE() AND status = 'PROGRAMADA'"
  );
  return { hoy: Number(hoy[0].total), proximas: Number(proximas[0].total) };
}

/**
 * Fecha corta 'YYYY-MM-DD' desde Date de mysql2 o string (cálculos de
 * umbrales, misma conversión que models/maintenance.js).
 */
function fechaCorta(valor) {
  if (!valor) {
    return null;
  }
  if (typeof valor === 'string') {
    return valor.slice(0, 10);
  }
  const anio = valor.getFullYear();
  const mes = String(valor.getMonth() + 1).padStart(2, '0');
  const dia = String(valor.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Mantenimientos PENDING con los datos que exige la evaluación de umbrales
 * (RN-11): el vencimiento se deriva en el servicio con `maintenance-state`.
 */
export async function findPendientes() {
  const [filas] = await getPool().query(
    `SELECT id, vehicle_id, target_date, target_mileage
     FROM maintenance_plans
     WHERE status = 'PENDING'`
  );
  return filas.map((fila) => ({
    id: fila.id,
    vehicleId: fila.vehicle_id,
    status: 'PENDING',
    targetDate: fechaCorta(fila.target_date),
    targetMileage: fila.target_mileage != null ? Number(fila.target_mileage) : null,
  }));
}

/** Refacciones activas con stock bajo (stock <= mínimo, FR-015 del Sprint 3). */
export async function contarStockBajo() {
  const [filas] = await getPool().query(
    'SELECT COUNT(*) AS total FROM parts WHERE is_active = 1 AND stock <= min_stock'
  );
  return Number(filas[0].total);
}
