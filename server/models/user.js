/**
 * Acceso a datos de usuarios (T023, US1).
 * Todas las consultas pasan por el pool central; el mapeo de filas a objetos
 * ocurre aquí para que services y controllers no vean snake_case.
 */
import { getPool } from '../config/db.js';

function aObjeto(fila) {
  if (!fila) {
    return null;
  }
  return {
    id: fila.id,
    username: fila.username,
    email: fila.email,
    passwordHash: fila.password_hash,
    fullName: fila.full_name,
    role: fila.role,
    active: Boolean(fila.active),
  };
}

/**
 * Busca un usuario por username O correo electrónico en el mismo campo (RN-16).
 */
export async function findByLogin(identificacion) {
  const [filas] = await getPool().query(
    'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1',
    [identificacion, identificacion]
  );
  return aObjeto(filas[0]);
}

export async function findById(id) {
  const [filas] = await getPool().query('SELECT * FROM users WHERE id = ?', [id]);
  return aObjeto(filas[0]);
}

export async function findAll() {
  const [filas] = await getPool().query(
    'SELECT * FROM users ORDER BY active DESC, username ASC'
  );
  return filas.map(aObjeto);
}

/**
 * Mecánicos activos para la asignación manual de órdenes (FR-008, US4).
 * Solo los campos seguros: nunca password_hash ni correo interno.
 */
export async function findMechanics() {
  const [filas] = await getPool().query(
    "SELECT id, username, full_name FROM users WHERE role = 'MECHANIC' AND active = 1 ORDER BY full_name ASC"
  );
  return filas.map((fila) => ({
    id: fila.id,
    username: fila.username,
    fullName: fila.full_name,
  }));
}

/** Cuenta los administradores activos (guard de último administrador). */
export async function countActiveAdmins(exceptoId = null) {
  const [filas] = await getPool().query(
    'SELECT COUNT(*) AS total FROM users WHERE role = ? AND active = 1 AND id <> ?',
    ['ADMIN', exceptoId ?? 0]
  );
  return Number(filas[0].total);
}

export async function create({ username, email, passwordHash, fullName, role }) {
  const [resultado] = await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    [username, email, passwordHash, fullName, role]
  );
  return findById(resultado.insertId);
}

export async function update(id, { email, fullName, role }) {
  await getPool().query(
    'UPDATE users SET email = ?, full_name = ?, role = ? WHERE id = ?',
    [email, fullName, role, id]
  );
  return findById(id);
}

export async function updatePassword(id, passwordHash) {
  await getPool().query('UPDATE users SET password_hash = ? WHERE id = ?', [
    passwordHash,
    id,
  ]);
}

export async function setStatus(id, active) {
  await getPool().query('UPDATE users SET active = ? WHERE id = ?', [
    active ? 1 : 0,
    id,
  ]);
  return findById(id);
}
