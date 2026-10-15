/**
 * Acceso a datos de citas (T036, US1; Sprint 2).
 * Unicidad de horario por vehículo: (vehicle_id, appointment_date,
 * appointment_time) con llave única en la migración 005.
 */
import { getPool } from '../config/db.js';

function aObjeto(fila) {
  if (!fila) {
    return null;
  }
  return {
    id: fila.id,
    clientId: fila.client_id,
    vehicleId: fila.vehicle_id,
    appointmentDate: fila.appointment_date instanceof Date
      ? fila.appointment_date.toISOString().slice(0, 10)
      : fila.appointment_date,
    appointmentTime: fila.appointment_time,
    reason: fila.reason,
    status: fila.status,
    cancellationReason: fila.cancellation_reason,
    createdBy: fila.created_by,
    createdAt: fila.created_at,
    updatedAt: fila.updated_at,
  };
}

/** Fila de listado enriquecida con cliente y vehículo. */
function aObjetoDeListado(fila) {
  if (!fila) {
    return null;
  }
  return {
    ...aObjeto(fila),
    clientName: fila.client_name ?? null,
    plates: fila.plates ?? null,
    vehicleDescription: fila.vehicle_description ?? null,
  };
}

const CONSULTA_CON_RELACIONES = `
  SELECT a.*, c.full_name AS client_name, v.plates AS plates,
         CONCAT(v.brand, ' ', v.model, ' (', v.year, ')') AS vehicle_description
  FROM appointments a
  JOIN clients c ON c.id = a.client_id
  JOIN vehicles v ON v.id = a.vehicle_id
`;

/**
 * Listado con filtros: fecha exacta (?fecha=YYYY-MM-DD) y texto (?texto=,
 * nombre de cliente o placas).
 */
export async function findAll({ fecha = null, texto = null } = {}) {
  const condiciones = [];
  const parametros = [];

  if (fecha) {
    condiciones.push('a.appointment_date = ?');
    parametros.push(fecha);
  }
  if (texto) {
    condiciones.push('(c.full_name LIKE ? OR v.plates LIKE ?)');
    const busqueda = `%${texto}%`;
    parametros.push(busqueda, busqueda);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [filas] = await getPool().query(
    `${CONSULTA_CON_RELACIONES} ${where} ORDER BY a.appointment_date ASC, a.appointment_time ASC`,
    parametros
  );
  return filas.map(aObjetoDeListado);
}

export async function findById(id) {
  const [filas] = await getPool().query(
    `${CONSULTA_CON_RELACIONES} WHERE a.id = ?`,
    [id]
  );
  return aObjetoDeListado(filas[0]);
}

/** ¿Existe otra cita del vehículo en la misma fecha y hora? (CA-1) */
export async function findByVehicleAndSlot(vehicleId, fecha, hora, excluirId = null) {
  const [filas] = await getPool().query(
    `SELECT id FROM appointments
     WHERE vehicle_id = ? AND appointment_date = ? AND appointment_time = ?
       AND id <> ? LIMIT 1`,
    [vehicleId, fecha, hora, excluirId ?? 0]
  );
  return filas.length > 0;
}

export async function create({ clientId, vehicleId, appointmentDate, appointmentTime, reason, createdBy }) {
  const [resultado] = await getPool().query(
    `INSERT INTO appointments (client_id, vehicle_id, appointment_date, appointment_time, reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [clientId, vehicleId, appointmentDate, appointmentTime, reason, createdBy ?? null]
  );
  return findById(resultado.insertId);
}

/** Edición de fecha, hora, motivo o vehículo (solo citas PROGRAMADA). */
export async function update(id, { clientId, vehicleId, appointmentDate, appointmentTime, reason }) {
  await getPool().query(
    `UPDATE appointments
     SET client_id = ?, vehicle_id = ?, appointment_date = ?, appointment_time = ?, reason = ?
     WHERE id = ?`,
    [clientId, vehicleId, appointmentDate, appointmentTime, reason, id]
  );
  return findById(id);
}

export async function setStatus(id, { status, cancellationReason = null }) {
  await getPool().query(
    'UPDATE appointments SET status = ?, cancellation_reason = ? WHERE id = ?',
    [status, cancellationReason, id]
  );
  return findById(id);
}
