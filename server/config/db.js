/**
 * Pool de conexiones a MySQL local (T009, research D2).
 *
 * Único punto de acceso a la base de datos: solo el backend se conecta; el
 * frontend NUNCA se conecta directamente (Principio III). La configuración
 * viene exclusivamente de variables de entorno.
 */
import mysql from 'mysql2/promise';

let pool = null;

/**
 * Devuelve el pool de conexiones, creándolo si es necesario.
 * Usa DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_NAME del entorno.
 */
export function getPool() {
  if (pool) {
    return pool;
  }
  pool = mysql.createPool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
  });
  return pool;
}

/** Reemplaza el pool activo (útil para las pruebas contra motorix_test). */
export function setPool(newPool) {
  pool = newPool;
}

/** Cierra el pool si existe (uso en pruebas y apagado ordenado). */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
