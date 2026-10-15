/**
 * Acceso a datos de clientes (T043, US3/US4/US6).
 */
import { getPool } from '../config/db.js';

function aObjeto(fila) {
  if (!fila) {
    return null;
  }
  return {
    id: fila.id,
    fullName: fila.full_name,
    phone: fila.phone,
    email: fila.email,
    notes: fila.notes,
    active: Boolean(fila.active),
  };
}

/** Lista clientes; por defecto solo activos (inactivos no aparecen en operaciones nuevas). */
export async function findAll({ incluirInactivos = false } = {}) {
  const condicion = incluirInactivos ? '' : 'WHERE active = 1';
  const [filas] = await getPool().query(
    `SELECT * FROM clients ${condicion} ORDER BY full_name ASC`
  );
  return filas.map(aObjeto);
}

export async function findById(id) {
  const [filas] = await getPool().query('SELECT * FROM clients WHERE id = ?', [id]);
  return aObjeto(filas[0]);
}

export async function create({ fullName, phone, email, notes }) {
  const [resultado] = await getPool().query(
    'INSERT INTO clients (full_name, phone, email, notes) VALUES (?, ?, ?, ?)',
    [fullName, phone, email ?? null, notes ?? null]
  );
  return findById(resultado.insertId);
}

export async function update(id, { fullName, phone, email, notes }) {
  await getPool().query(
    'UPDATE clients SET full_name = ?, phone = ?, email = ?, notes = ? WHERE id = ?',
    [fullName, phone, email ?? null, notes ?? null, id]
  );
  return findById(id);
}

export async function setStatus(id, active) {
  await getPool().query('UPDATE clients SET active = ? WHERE id = ?', [
    active ? 1 : 0,
    id,
  ]);
  return findById(id);
}
