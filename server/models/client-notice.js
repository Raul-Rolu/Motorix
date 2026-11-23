/**
 * Acceso a datos de los avisos a clientes (007-notificaciones-internas, T061 y
 * T062; FR-014, FR-015, CA-10, CA-11).
 *
 * `client_notices` registra que alguien avisó a un cliente por un hecho
 * concreto (orden terminada, cita de mañana o mantenimiento). La restricción
 * única (notice_type, fact_id) hace que un hecho se avise UNA sola vez y
 * resuelve la concurrencia. Las consultas de hechos pendientes son propias de
 * este módulo: traen cliente (con teléfono) y vehículo, y excluyen con
 * `NOT EXISTS` los hechos ya avisados.
 */
import { getPool } from '../config/db.js';

const FORMATO_FECHA_HORA = '%Y-%m-%dT%H:%i:%s';

function aAviso(fila) {
  if (!fila) {
    return null;
  }
  return {
    id: fila.id,
    tipo: fila.notice_type,
    hechoId: fila.fact_id,
    nota: fila.note ?? null,
    avisadoPor: { id: fila.notified_by, nombreCompleto: fila.notifier_name },
    fecha: fila.fecha,
  };
}

const SELECT_AVISO = `
  SELECT n.id, n.notice_type, n.fact_id, n.note, n.notified_by,
         u.full_name AS notifier_name,
         DATE_FORMAT(n.notified_at, '${FORMATO_FECHA_HORA}') AS fecha
  FROM client_notices n
  JOIN users u ON u.id = n.notified_by`;

/** Aviso ya registrado para un hecho, o null. */
export async function findPorHecho(tipo, hechoId) {
  const [filas] = await getPool().query(
    `${SELECT_AVISO} WHERE n.notice_type = ? AND n.fact_id = ?`,
    [tipo, hechoId]
  );
  return aAviso(filas[0]);
}

async function findPorId(id) {
  const [filas] = await getPool().query(`${SELECT_AVISO} WHERE n.id = ?`, [id]);
  return aAviso(filas[0]);
}

/**
 * Registra el aviso a un cliente. Si el hecho ya se avisó (la restricción
 * única lo rechaza) el error `ER_DUP_ENTRY` llega tal cual al servicio, que lo
 * traduce a `CLIENT_NOTICE_DUPLICATE`.
 */
export async function crear({ clientId, tipo, hechoId, nota = null, userId }) {
  const [resultado] = await getPool().query(
    `INSERT INTO client_notices (client_id, notice_type, fact_id, note, notified_by)
     VALUES (?, ?, ?, ?, ?)`,
    [clientId, tipo, hechoId, nota, userId]
  );
  return findPorId(resultado.insertId);
}

/** Cliente y vehículo de una fila de las consultas de hechos pendientes. */
function aClienteYVehiculo(fila) {
  return {
    cliente: {
      id: fila.client_id,
      nombreCompleto: fila.client_name,
      telefono: fila.client_phone,
    },
    vehiculo: {
      id: fila.vehicle_id,
      placas: fila.plates,
      marca: fila.brand,
      modelo: fila.model,
    },
  };
}

const COLUMNAS_CLIENTE_Y_VEHICULO = `
  c.id AS client_id, c.full_name AS client_name, c.phone AS client_phone,
  v.id AS vehicle_id, v.plates, v.brand, v.model`;

/**
 * Órdenes TERMINADO (sin entregar) cuyo aviso al cliente aún no se registró.
 * La fecha de referencia es la del último cambio de estado (cuándo quedó lista).
 */
export async function findOrdenesTerminadasPendientes() {
  const [filas] = await getPool().query(
    `SELECT o.id, DATE_FORMAT(o.status_changed_at, '${FORMATO_FECHA_HORA}') AS fecha_referencia,
            ${COLUMNAS_CLIENTE_Y_VEHICULO}
     FROM service_orders o
     JOIN clients c ON c.id = o.client_id
     JOIN vehicles v ON v.id = o.vehicle_id
     WHERE o.status = 'TERMINADO'
       AND NOT EXISTS (
         SELECT 1 FROM client_notices n
         WHERE n.notice_type = 'ORDEN_TERMINADA' AND n.fact_id = o.id
       )
     ORDER BY o.status_changed_at ASC, o.id ASC`
  );
  return filas.map((fila) => ({
    id: fila.id,
    fechaReferencia: fila.fecha_referencia,
    ...aClienteYVehiculo(fila),
  }));
}

/** Citas PROGRAMADAS de una fecha (`YYYY-MM-DD`) cuyo aviso al cliente aún no se registró. */
export async function findCitasPendientesPorFecha(fecha) {
  const [filas] = await getPool().query(
    `SELECT a.id, a.appointment_time, ${COLUMNAS_CLIENTE_Y_VEHICULO}
     FROM appointments a
     JOIN clients c ON c.id = a.client_id
     JOIN vehicles v ON v.id = a.vehicle_id
     WHERE a.appointment_date = ? AND a.status = 'PROGRAMADA'
       AND NOT EXISTS (
         SELECT 1 FROM client_notices n
         WHERE n.notice_type = 'CITA_MANANA' AND n.fact_id = a.id
       )
     ORDER BY a.appointment_time ASC, a.id ASC`,
    [fecha]
  );
  return filas.map((fila) => ({
    id: fila.id,
    fecha,
    hora: String(fila.appointment_time).slice(0, 5),
    ...aClienteYVehiculo(fila),
  }));
}

/**
 * Planes de mantenimiento PENDING cuyo aviso al cliente aún no se registró, con
 * el cliente propietario del vehículo. El servicio los clasifica como vencidos
 * o próximos (necesita el kilometraje actual); un plan avisado como próximo que
 * después vence es el MISMO hecho y no vuelve.
 */
export async function findMantenimientosPendientes() {
  const [filas] = await getPool().query(
    `SELECT m.id, m.description, m.status,
            DATE_FORMAT(m.target_date, '%Y-%m-%d') AS target_date, m.target_mileage,
            ${COLUMNAS_CLIENTE_Y_VEHICULO}
     FROM maintenance_plans m
     JOIN vehicles v ON v.id = m.vehicle_id
     JOIN clients c ON c.id = v.client_id
     WHERE m.status = 'PENDING'
       AND NOT EXISTS (
         SELECT 1 FROM client_notices n
         WHERE n.notice_type = 'MANTENIMIENTO' AND n.fact_id = m.id
       )
     ORDER BY m.id ASC`
  );
  return filas.map((fila) => ({
    id: fila.id,
    description: fila.description,
    status: fila.status,
    vehicleId: fila.vehicle_id,
    targetDate: fila.target_date,
    targetMileage: fila.target_mileage != null ? Number(fila.target_mileage) : null,
    ...aClienteYVehiculo(fila),
  }));
}
