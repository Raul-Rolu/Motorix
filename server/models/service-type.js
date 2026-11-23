/**
 * Acceso a datos del catálogo de tipos de servicio
 * (008-configuracion-seguridad-reportes, T037; FR-006, CA-4).
 *
 * Los tipos nunca se borran (no hay función de borrado): solo se desactivan.
 * El nombre es único sin distinguir mayúsculas (colación de la tabla); la
 * violación de unicidad llega como `ER_DUP_ENTRY` y la traduce el servicio.
 */
import { getPool } from '../config/db.js';

export function aObjeto(fila) {
  if (!fila) {
    return null;
  }
  return {
    id: fila.id,
    nombre: fila.name,
    intervaloDias: fila.interval_days ?? null,
    intervaloKm: fila.interval_km ?? null,
    activo: Boolean(fila.active),
  };
}

/** Tipos ordenados por nombre; por omisión solo los activos. */
export async function findAll({ incluirInactivos = false } = {}) {
  const filtro = incluirInactivos ? '' : 'WHERE active = 1';
  const [filas] = await getPool().query(`SELECT * FROM service_types ${filtro} ORDER BY name ASC`);
  return filas.map(aObjeto);
}

export async function findById(id) {
  const [filas] = await getPool().query('SELECT * FROM service_types WHERE id = ?', [id]);
  return aObjeto(filas[0]);
}

export async function create({ nombre, intervaloDias, intervaloKm }) {
  const [resultado] = await getPool().query(
    'INSERT INTO service_types (name, interval_days, interval_km) VALUES (?, ?, ?)',
    [nombre, intervaloDias, intervaloKm]
  );
  return findById(resultado.insertId);
}

export async function update(id, { nombre, intervaloDias, intervaloKm }) {
  await getPool().query(
    'UPDATE service_types SET name = ?, interval_days = ?, interval_km = ? WHERE id = ?',
    [nombre, intervaloDias, intervaloKm, id]
  );
  return findById(id);
}

export async function setActive(id, activo) {
  await getPool().query('UPDATE service_types SET active = ? WHERE id = ?', [activo ? 1 : 0, id]);
  return findById(id);
}
