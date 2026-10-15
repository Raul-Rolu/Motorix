/**
 * Acceso a datos de vehículos (T056, US5/US6).
 */
import { getPool } from '../config/db.js';

function aObjeto(fila) {
  if (!fila) {
    return null;
  }
  return {
    id: fila.id,
    clientId: fila.client_id,
    plates: fila.plates,
    brand: fila.brand,
    model: fila.model,
    year: fila.year,
    color: fila.color,
    notes: fila.notes,
  };
}

/** Filas con los datos del propietario para las respuestas enriquecidas. */
function aObjetoConDuenio(fila) {
  const vehiculo = aObjeto(fila);
  if (!vehiculo || fila.duenio_id == null) {
    return vehiculo;
  }
  return {
    ...vehiculo,
    duenio: {
      id: fila.duenio_id,
      fullName: fila.duenio_nombre,
      phone: fila.duenio_telefono,
      active: Boolean(fila.duenio_activo),
    },
  };
}

const CONSULTA_CON_DUENIO = `
  SELECT v.*, c.id AS duenio_id, c.full_name AS duenio_nombre,
         c.phone AS duenio_telefono, c.active AS duenio_activo
  FROM vehicles v
  JOIN clients c ON c.id = v.client_id
`;

export async function findAll() {
  const [filas] = await getPool().query(
    `${CONSULTA_CON_DUENIO} ORDER BY v.plates ASC`
  );
  return filas.map(aObjetoConDuenio);
}

export async function findById(id) {
  const [filas] = await getPool().query(`${CONSULTA_CON_DUENIO} WHERE v.id = ?`, [id]);
  return aObjetoConDuenio(filas[0]);
}

export async function findByPlates(plates) {
  const [filas] = await getPool().query('SELECT * FROM vehicles WHERE plates = ?', [
    plates,
  ]);
  return aObjeto(filas[0]);
}

export async function findByClient(clientId) {
  const [filas] = await getPool().query(
    'SELECT * FROM vehicles WHERE client_id = ? ORDER BY plates ASC',
    [clientId]
  );
  return filas.map(aObjeto);
}

export async function create({ clientId, plates, brand, model, year, color, notes }) {
  const [resultado] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year, color, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [clientId, plates, brand, model, year, color ?? null, notes ?? null]
  );
  return findById(resultado.insertId);
}

export async function update(id, { clientId, plates, brand, model, year, color, notes }) {
  await getPool().query(
    'UPDATE vehicles SET client_id = ?, plates = ?, brand = ?, model = ?, year = ?, color = ?, notes = ? WHERE id = ?',
    [clientId, plates, brand, model, year, color ?? null, notes ?? null, id]
  );
  return findById(id);
}
