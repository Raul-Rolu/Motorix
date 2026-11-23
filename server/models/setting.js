/**
 * Acceso a datos de la configuración (008-configuracion-seguridad-reportes,
 * T019; FR-001). Tabla clave-valor `settings`: este modelo solo lee y escribe
 * filas; la interpretación de los valores, los límites y los valores de
 * respaldo viven en el servicio y en `utils/settings-defaults.js`.
 */
import { getPool } from '../config/db.js';

/** Todas las filas guardadas como `{ clave: texto }` (sin caché: una consulta). */
export async function findAll() {
  const [filas] = await getPool().query('SELECT setting_key, setting_value FROM settings');
  return Object.fromEntries(filas.map((fila) => [fila.setting_key, fila.setting_value]));
}

/**
 * Guarda varias claves a la vez (alta o actualización) y registra al autor.
 * Los valores se guardan como texto; una clave existente se actualiza sin duplicarse.
 */
export async function upsertMany(cambios, userId) {
  const entradas = Object.entries(cambios);
  if (entradas.length === 0) {
    return;
  }
  const marcadores = entradas.map(() => '(?, ?, ?)').join(', ');
  const parametros = entradas.flatMap(([clave, valor]) => [clave, String(valor), userId ?? null]);
  await getPool().query(
    `INSERT INTO settings (setting_key, setting_value, updated_by) VALUES ${marcadores}
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
    parametros
  );
}
