/**
 * Acceso a datos de órdenes de servicio (T014, Sprint 2).
 * Órdenes de la tabla `service_orders` con sus relaciones (clients, vehicles,
 * users) y el historial de partidas y entradas.
 */
import { getPool } from '../config/db.js';

export function aObjeto(fila) {
  if (!fila) {
    return null;
  }
  return {
    id: fila.id,
    clientId: fila.client_id,
    vehicleId: fila.vehicle_id,
    mechanicId: fila.mechanic_id,
    status: fila.status,
    previousState: fila.previous_state,
    mileageEntry: fila.mileage_entry,
    mileageCorrection: Boolean(fila.mileage_correction),
    reason: fila.reason,
    notes: fila.notes,
    cancellationReason: fila.cancellation_reason,
    createdBy: fila.created_by,
    createdAt: fila.created_at,
    updatedAt: fila.updated_at,
  };
}

/** Fila de listado enriquecida con propietario, placas y mecánico. */
function aObjetoDeListado(fila) {
  const orden = aObjeto(fila);
  return {
    ...orden,
    clientName: fila.client_name ?? null,
    plates: fila.plates ?? null,
    mechanicName: fila.mechanic_name ?? null,
  };
}

/**
 * Listado de órdenes con filtros de estado (?estado=), texto (?texto=, placas
 * o nombre del cliente) y mecánico (visibilidad de la US4, RN-15).
 */
export async function findAll({ estado = null, texto = null, mechanicId = null } = {}) {
  const condiciones = [];
  const parametros = [];

  if (estado) {
    condiciones.push('o.status = ?');
    parametros.push(estado);
  }
  if (texto) {
    condiciones.push('(v.plates LIKE ? OR c.full_name LIKE ?)');
    const busqueda = `%${texto}%`;
    parametros.push(busqueda, busqueda);
  }
  if (mechanicId != null) {
    condiciones.push('o.mechanic_id = ?');
    parametros.push(mechanicId);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [filas] = await getPool().query(
    `SELECT o.*, c.full_name AS client_name, v.plates AS plates,
            u.full_name AS mechanic_name
     FROM service_orders o
     JOIN clients c ON c.id = o.client_id
     JOIN vehicles v ON v.id = o.vehicle_id
     LEFT JOIN users u ON u.id = o.mechanic_id
     ${where}
     ORDER BY o.created_at DESC, o.id DESC`,
    parametros
  );
  return filas.map(aObjetoDeListado);
}

export async function findById(id) {
  const [filas] = await getPool().query('SELECT * FROM service_orders WHERE id = ?', [id]);
  return aObjeto(filas[0]);
}

/** Último kilometraje registrado para el vehículo (RN-4, research D4).
 * `excluirId` permite ignorar la propia orden al editar (edición PUT). */
export async function findLastMileageByVehicle(vehicleId, excluirId = null) {
  const [filas] = await getPool().query(
    'SELECT MAX(mileage_entry) AS previo FROM service_orders WHERE vehicle_id = ? AND id <> ?',
    [vehicleId, excluirId ?? 0]
  );
  return filas[0]?.previo ?? null;
}

export async function create({
  clientId,
  vehicleId,
  mechanicId,
  mileageEntry,
  mileageCorrection,
  reason,
  notes,
  createdBy,
}) {
  const [resultado] = await getPool().query(
    `INSERT INTO service_orders
       (client_id, vehicle_id, mechanic_id, status, mileage_entry, mileage_correction, reason, notes, created_by)
     VALUES (?, ?, ?, 'RECIBIDO', ?, ?, ?, ?, ?)`,
    [clientId, vehicleId, mechanicId ?? null, mileageEntry, mileageCorrection ? 1 : 0, reason, notes ?? null, createdBy ?? null]
  );
  return findById(resultado.insertId);
}

/** Edición de motivo, notas y/o kilometraje con corrección (solo estados de trabajo). */
export async function update(id, { reason, notes, mileageEntry, mileageCorrection }) {
  await getPool().query(
    'UPDATE service_orders SET reason = ?, notes = ?, mileage_entry = ?, mileage_correction = ? WHERE id = ?',
    [reason, notes ?? null, mileageEntry, mileageCorrection ? 1 : 0, id]
  );
  return findById(id);
}

export async function setMechanic(id, mechanicId) {
  await getPool().query('UPDATE service_orders SET mechanic_id = ? WHERE id = ?', [
    mechanicId ?? null,
    id,
  ]);
  return findById(id);
}

export async function setStatus(id, { status, previousState = null, cancellationReason = null }) {
  await getPool().query(
    'UPDATE service_orders SET status = ?, previous_state = ?, cancellation_reason = ? WHERE id = ?',
    [status, previousState, cancellationReason, id]
  );
  return findById(id);
}

/** Entradas fechadas de la orden (diagnóstico, observación, recomendación). */
export async function findEntries(orderId) {
  const [filas] = await getPool().query(
    `SELECT e.id, e.entry_type, e.content, e.created_by, e.created_at,
            u.full_name AS author_name, u.username AS author_username
     FROM order_entries e
     LEFT JOIN users u ON u.id = e.created_by
     WHERE e.order_id = ?
     ORDER BY e.created_at ASC, e.id ASC`,
    [orderId]
  );
  return filas.map((fila) => ({
    id: fila.id,
    entryType: fila.entry_type,
    content: fila.content,
    createdBy: fila.created_by,
    authorName: fila.author_name ?? null,
    createdAt: fila.created_at,
  }));
}

export async function findServices(orderId) {
  const [filas] = await getPool().query(
    'SELECT id, description, amount FROM order_services WHERE order_id = ? ORDER BY id ASC',
    [orderId]
  );
  return filas.map((fila) => ({
    id: fila.id,
    kind: 'SERVICE',
    description: fila.description,
    amount: Number(fila.amount),
  }));
}

export async function findLabor(orderId) {
  const [filas] = await getPool().query(
    'SELECT id, description, amount FROM order_labor WHERE order_id = ? ORDER BY id ASC',
    [orderId]
  );
  return filas.map((fila) => ({
    id: fila.id,
    kind: 'LABOR',
    description: fila.description,
    amount: Number(fila.amount),
  }));
}

/**
 * Cálculo puro de los totales de una orden (005, FR-007/FR-008, CA-6/CA-7).
 * `partsTotal` es la suma de `unit_price × quantity` de las líneas con
 * precio; `refaccionesSinPrecio` cuenta los usos con `unit_price` nulo, que
 * marcan el total como incompleto.
 */
export function calcularTotales({
  services = 0,
  labor = 0,
  partsTotal = 0,
  refaccionesSinPrecio = 0,
} = {}) {
  return {
    services,
    labor,
    parts: partsTotal,
    grand: services + labor + partsTotal,
    totalCompleto: refaccionesSinPrecio === 0,
    refaccionesSinPrecio,
  };
}

/** Totales informativos de la orden: servicios + mano de obra + refacciones. */
export async function findTotals(orderId) {
  const [servicios] = await getPool().query(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM order_services WHERE order_id = ?',
    [orderId]
  );
  const [manoDeObra] = await getPool().query(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM order_labor WHERE order_id = ?',
    [orderId]
  );
  const [refacciones] = await getPool().query(
    `SELECT COALESCE(SUM(unit_price * quantity), 0) AS total,
            SUM(unit_price IS NULL) AS sinPrecio
     FROM order_parts WHERE order_id = ?`,
    [orderId]
  );
  return calcularTotales({
    services: Number(servicios[0].total),
    labor: Number(manoDeObra[0].total),
    partsTotal: Number(refacciones[0].total),
    refaccionesSinPrecio: Number(refacciones[0].sinPrecio ?? 0),
  });
}

/** Registra una entrada fechada (historial inmutable; sin UPDATE ni DELETE). */
export async function createEntry({ orderId, entryType, content, createdBy }) {
  const [resultado] = await getPool().query(
    'INSERT INTO order_entries (order_id, entry_type, content, created_by) VALUES (?, ?, ?, ?)',
    [orderId, entryType, content, createdBy ?? null]
  );
  const [filas] = await getPool().query(
    'SELECT id, entry_type, content, created_by, created_at FROM order_entries WHERE id = ?',
    [resultado.insertId]
  );
  const fila = filas[0];
  return {
    id: fila.id,
    entryType: fila.entry_type,
    content: fila.content,
    createdBy: fila.created_by,
    createdAt: fila.created_at,
  };
}

/** Busca una partida en `order_services` o `order_labor`. */
export async function findPart(orderId, partId) {
  const [servicios] = await getPool().query(
    'SELECT id, description, amount FROM order_services WHERE id = ? AND order_id = ?',
    [partId, orderId]
  );
  if (servicios.length > 0) {
    return {
      id: servicios[0].id,
      kind: 'SERVICE',
      description: servicios[0].description,
      amount: Number(servicios[0].amount),
    };
  }
  const [manoDeObra] = await getPool().query(
    'SELECT id, description, amount FROM order_labor WHERE id = ? AND order_id = ?',
    [partId, orderId]
  );
  if (manoDeObra.length > 0) {
    return {
      id: manoDeObra[0].id,
      kind: 'LABOR',
      description: manoDeObra[0].description,
      amount: Number(manoDeObra[0].amount),
    };
  }
  return null;
}

/** Inserta una partida en la tabla correspondiente (SERVICE o LABOR). */
export async function createPart({ orderId, description, amount, kind }) {
  const tabla = kind === 'LABOR' ? 'order_labor' : 'order_services';
  const [resultado] = await getPool().query(
    `INSERT INTO ${tabla} (order_id, description, amount) VALUES (?, ?, ?)`,
    [orderId, description, amount]
  );
  return { id: resultado.insertId, kind, description, amount: Number(amount) };
}

/** Elimina una partida (solo antes de cerrar la orden). */
export async function deletePart(orderId, partId) {
  await getPool().query('DELETE FROM order_services WHERE id = ? AND order_id = ?', [
    partId,
    orderId,
  ]);
  await getPool().query('DELETE FROM order_labor WHERE id = ? AND order_id = ?', [
    partId,
    orderId,
  ]);
}

/**
 * Historial de servicios del vehículo (Sprint 3, US1, FR-001/FR-002, RN-10).
 * Derivado de las órdenes TERMINADO/ENTREGADO: sin copias ni duplicados.
 * Devuelve filas enriquecidas con mecánico, resumen (última entrada, conteos y
 * totales) para que la respuesta no requiera consultas N+1.
 */
export async function findVehicleHistory(vehicleId, { order = 'desc' } = {}) {
  const direccion = order === 'asc' ? 'ASC' : 'DESC';
  const [filas] = await getPool().query(
    `SELECT o.id, o.created_at, o.mileage_entry, o.mileage_correction,
            o.reason, o.notes, o.mechanic_id, u.full_name AS mechanic_name,
            v.plates, v.brand, v.model, v.year,
            (SELECT e.content FROM order_entries e
              WHERE e.order_id = o.id
              ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS last_entry,
            (SELECT COUNT(*) FROM order_services s WHERE s.order_id = o.id) AS services_count,
            (SELECT COALESCE(SUM(s.amount), 0) FROM order_services s WHERE s.order_id = o.id) AS services_total,
            (SELECT COUNT(*) FROM order_labor l WHERE l.order_id = o.id) AS labor_count,
            (SELECT COALESCE(SUM(l.amount), 0) FROM order_labor l WHERE l.order_id = o.id) AS labor_total,
            (SELECT COUNT(*) FROM order_parts op WHERE op.order_id = o.id) AS parts_count,
            (SELECT COALESCE(SUM(op2.unit_price * op2.quantity), 0)
               FROM order_parts op2
              WHERE op2.order_id = o.id AND op2.unit_price IS NOT NULL) AS parts_total
     FROM service_orders o
     JOIN vehicles v ON v.id = o.vehicle_id
     LEFT JOIN users u ON u.id = o.mechanic_id
     WHERE o.vehicle_id = ? AND o.status IN ('TERMINADO', 'ENTREGADO')
     ORDER BY o.created_at ${direccion}, o.id ${direccion}`,
    [vehicleId]
  );
  return filas;
}

/** Refacciones usadas por un conjunto de órdenes (para el resumen del historial). */
export async function findPartsByOrders(orderIds) {
  if (orderIds.length === 0) {
    return [];
  }
  const marcadores = orderIds.map(() => '?').join(', ');
  const [filas] = await getPool().query(
    `SELECT op.order_id, p.name AS part_name, op.quantity, op.unit_price
     FROM order_parts op
     JOIN parts p ON p.id = op.part_id
     WHERE op.order_id IN (${marcadores})
     ORDER BY op.id ASC`,
    orderIds
  );
  return filas;
}

/** Refacciones usadas por una orden (Sprint 3, US7; detalle GET /api/orders/:id). */
export async function findOrderParts(orderId) {
  const [filas] = await getPool().query(
    `SELECT op.id, op.part_id, op.quantity, op.unit_price, p.name, p.code
     FROM order_parts op
     JOIN parts p ON p.id = op.part_id
     WHERE op.order_id = ?
     ORDER BY op.id ASC`,
    [orderId]
  );
  return filas.map((fila) => ({
    id: fila.id,
    partId: fila.part_id,
    nombre: fila.name,
    code: fila.code,
    quantity: fila.quantity,
    // Precio congelado al momento de agregarla (005, FR-004/FR-006).
    unitPrice: fila.unit_price === null || fila.unit_price === undefined
      ? null
      : Number(fila.unit_price),
    amount:
      fila.unit_price === null || fila.unit_price === undefined
        ? null
        : Number(fila.unit_price) * fila.quantity,
  }));
}

/**
 * Usos de refacción SIN precio de la orden, en la forma del `details` del
 * error `TOTAL_INCOMPLETO` (005, contracts/api-rest.md: lista de
 * `{ orderPartId, partId, nombre }`).
 */
export async function findOrderPartsSinPrecio(orderId) {
  const [filas] = await getPool().query(
    `SELECT op.id AS orderPartId, op.part_id AS partId, p.name AS nombre
     FROM order_parts op
     JOIN parts p ON p.id = op.part_id
     WHERE op.order_id = ? AND op.unit_price IS NULL
     ORDER BY op.id ASC`,
    [orderId]
  );
  return filas;
}

/**
 * Línea de refacción concreta de la orden (T046, US7).
 * Acepta la conexión de la transacción del servicio (US7 atómico).
 */
export async function findOrderPart(orderId, orderPartId, conexion = null) {
  const db = conexion ?? getPool();
  const [filas] = await db.query(
    'SELECT id, part_id, quantity FROM order_parts WHERE id = ? AND order_id = ?',
    [orderPartId, orderId]
  );
  if (filas.length === 0) {
    return null;
  }
  return { id: filas[0].id, partId: filas[0].part_id, quantity: filas[0].quantity };
}

/** Registra una línea de refacción usada, con su precio congelado (005, T046/T021). */
export async function createOrderPart(
  { orderId, partId, quantity, unitPrice = null, createdBy },
  conexion = null
) {
  const db = conexion ?? getPool();
  const [resultado] = await db.query(
    `INSERT INTO order_parts (order_id, part_id, quantity, unit_price, created_by)
     VALUES (?, ?, ?, ?, ?)`,
    [orderId, partId, quantity, unitPrice ?? null, createdBy ?? null]
  );
  return {
    id: resultado.insertId,
    partId,
    quantity,
    unitPrice: unitPrice === null ? null : Number(unitPrice),
    amount: unitPrice === null ? null : Number(unitPrice) * quantity,
  };
}

/** Elimina una línea de refacción usada (T046, US7; la devolución genera su movimiento). */
export async function deleteOrderPart(orderId, orderPartId, conexion = null) {
  const db = conexion ?? getPool();
  await db.query('DELETE FROM order_parts WHERE id = ? AND order_id = ?', [
    orderPartId,
    orderId,
  ]);
}
