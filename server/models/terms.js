/**
 * Acceso a datos de los términos y condiciones
 * (008-configuracion-seguridad-reportes, T092; FR-019, FR-020, FR-022).
 *
 * Las versiones y las aceptaciones solo se insertan y consultan: este modelo NO
 * ofrece funciones para editarlas ni borrarlas. La versión vigente es la de
 * mayor número.
 */
import { getPool } from '../config/db.js';

const aVersion = (fila) => ({
  id: fila.id,
  version: fila.version,
  terminos: fila.terms_text,
  avisoPrivacidad: fila.privacy_text,
  publicadaEn: fila.published_at,
});

/** La versión vigente (mayor número) o `null` si no hay ninguna publicada. */
export async function findCurrent() {
  const [filas] = await getPool().query(
    'SELECT id, version, terms_text, privacy_text, published_at FROM terms_versions ORDER BY version DESC LIMIT 1'
  );
  return filas[0] ? aVersion(filas[0]) : null;
}

/** Una versión por su id o `null`. */
export async function findById(id) {
  const [filas] = await getPool().query(
    'SELECT id, version, terms_text, privacy_text, published_at FROM terms_versions WHERE id = ?',
    [id]
  );
  return filas[0] ? aVersion(filas[0]) : null;
}

/** ¿El usuario aceptó esa versión? */
export async function hasAccepted(userId, versionId) {
  const [filas] = await getPool().query(
    'SELECT 1 FROM terms_acceptances WHERE user_id = ? AND terms_version_id = ? LIMIT 1',
    [userId, versionId]
  );
  return filas.length > 0;
}

/** Guarda la aceptación; si ya existía no hace nada (única por usuario y versión). */
export async function insertAcceptance(userId, versionId) {
  await getPool().query(
    'INSERT IGNORE INTO terms_acceptances (user_id, terms_version_id) VALUES (?, ?)',
    [userId, versionId]
  );
}

/**
 * Inserta una versión nueva numerada con máximo + 1 en una sola sentencia (la
 * restricción única de `version` evita duplicados ante dos publicaciones a la vez).
 * @returns {Promise<number>} id de la versión creada.
 */
export async function insertVersion({ terminos, avisoPrivacidad, publicadaPor }) {
  const [resultado] = await getPool().query(
    `INSERT INTO terms_versions (version, terms_text, privacy_text, published_by)
     SELECT COALESCE(MAX(version), 0) + 1, ?, ?, ? FROM terms_versions`,
    [terminos, avisoPrivacidad, publicadaPor]
  );
  return resultado.insertId;
}

/** Una página de aceptaciones (la más reciente primero) y el total. */
export async function findAcceptancesPage({ limite, desplazamiento }) {
  const [[{ total }]] = await getPool().query('SELECT COUNT(*) AS total FROM terms_acceptances');
  const [filas] = await getPool().query(
    `SELECT a.id, a.user_id, u.full_name AS user_name, v.version, a.accepted_at
     FROM terms_acceptances a
     JOIN users u ON u.id = a.user_id
     JOIN terms_versions v ON v.id = a.terms_version_id
     ORDER BY a.accepted_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [limite, desplazamiento]
  );
  return {
    total: Number(total),
    filas: filas.map((fila) => ({
      usuario: { id: fila.user_id, nombre: fila.user_name },
      version: fila.version,
      aceptadaEn: fila.accepted_at,
    })),
  };
}
