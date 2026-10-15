/**
 * Acceso a datos de mantenimientos (Sprint 3, T022, US3/US4).
 * `maintenance_plans` con sus relaciones (vehicles, clients); el kilometraje
 * actual del vehículo se deriva de las órdenes (RN-3, research D2).
 */
import { getPool } from '../config/db.js';

/** Fecha corta 'YYYY-MM-DD' desde Date de mysql2 o string (cálculos de umbrales). */
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

export function aObjeto(fila) {
  if (!fila) {
    return null;
  }
  return {
    id: fila.id,
    vehicleId: fila.vehicle_id,
    description: fila.description,
    // Normalizada a 'YYYY-MM-DD': maintenance-state calcula días y vencimiento.
    targetDate: fechaCorta(fila.target_date),
    targetMileage: fila.target_mileage,
    status: fila.status,
    completedAt: fila.completed_at,
    completedBy: fila.completed_by,
    cancelledAt: fila.cancelled_at,
    cancellationReason: fila.cancellation_reason,
    cancelledBy: fila.cancelled_by,
    createdBy: fila.created_by,
    createdAt: fila.created_at,
  };
}

/** Filas del listado enriquecidas con vehículo y cliente (US4, FR-007). */
export function aObjetoDeListado(fila) {
  const mantenimiento = aObjeto(fila);
  return {
    ...mantenimiento,
    vehiculo: {
      id: fila.vehicle_id,
      placas: fila.plates,
      marca: fila.brand,
      modelo: fila.model,
    },
    cliente: fila.client_id
      ? {
          id: fila.client_id,
          nombreCompleto: fila.client_name,
          telefono: fila.client_phone,
        }
      : null,
  };
}

export async function create({ vehicleId, description, targetDate, targetMileage, createdBy }) {
  const [resultado] = await getPool().query(
    `INSERT INTO maintenance_plans
       (vehicle_id, description, target_date, target_mileage, status, created_by)
     VALUES (?, ?, ?, ?, 'PENDING', ?)`,
    [vehicleId, description, targetDate ?? null, targetMileage ?? null, createdBy ?? null]
  );
  return findById(resultado.insertId);
}

export async function findById(id) {
  const [filas] = await getPool().query(
    'SELECT * FROM maintenance_plans WHERE id = ?',
    [id]
  );
  return aObjeto(filas[0]);
}

/** Cumplimiento manual (aclaración Q1): PENDING → COMPLETED. */
export async function completar(id, userId) {
  await getPool().query(
    `UPDATE maintenance_plans
     SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP, completed_by = ?
     WHERE id = ?`,
    [userId ?? null, id]
  );
  return findById(id);
}

/** Cancelación (aclaración Q4): PENDING → CANCELLED con motivo y autor. */
export async function cancelar(id, { reason, userId }) {
  await getPool().query(
    `UPDATE maintenance_plans
     SET status = 'CANCELLED', cancelled_at = CURRENT_TIMESTAMP,
         cancellation_reason = ?, cancelled_by = ?
     WHERE id = ?`,
    [reason, userId ?? null, id]
  );
  return findById(id);
}

/**
 * Listado con filtros (FR-007): por defecto se excluyen los cancelados; el
 * filtro `status` explícito permite consultarlos (para auditoría).
 */
export async function findAll({ vehicleId = null, status = null, incluirCancelados = false } = {}) {
  const condiciones = [];
  const parametros = [];

  if (vehicleId != null) {
    condiciones.push('m.vehicle_id = ?');
    parametros.push(vehicleId);
  }
  if (status) {
    condiciones.push('m.status = ?');
    parametros.push(status);
  } else if (!incluirCancelados) {
    condiciones.push("m.status <> 'CANCELLED'");
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [filas] = await getPool().query(
    `SELECT m.*, v.plates, v.brand, v.model,
            c.id AS client_id, c.full_name AS client_name, c.phone AS client_phone
     FROM maintenance_plans m
     JOIN vehicles v ON v.id = m.vehicle_id
     JOIN clients c ON c.id = v.client_id
     ${where}
     ORDER BY m.created_at DESC, m.id DESC`,
    parametros
  );
  return filas.map(aObjetoDeListado);
}

/** Kilometraje actual (última orden) agrupado por vehículo (research D9). */
export async function findCurrentMileageByVehicles() {
  const [filas] = await getPool().query(
    'SELECT vehicle_id, MAX(mileage_entry) AS km FROM service_orders GROUP BY vehicle_id'
  );
  const mapa = new Map();
  for (const fila of filas) {
    mapa.set(fila.vehicle_id, Number(fila.km));
  }
  return mapa;
}
