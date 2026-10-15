/**
 * Infraestructura de pruebas: base `motorix_test` (T019, Principio VII).
 *
 * Crea la base de prueba si no existe, aplica las migraciones reales del
 * repositorio y expone utilidades para limpiar las tablas entre suites.
 * Las pruebas SIEMPRE corren contra `motorix_test`, nunca contra la base
 * principal.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { setPool, closePool } from '../../config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', '..', '..', 'database', 'migrations');

export function credencialesBasePruebas() {
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
}

export function nombreBasePruebas() {
  return process.env.DB_TEST_NAME ?? 'motorix_test';
}

/** Crea la base de pruebas (si falta) y aplica todas las migraciones reales. */
export async function prepararBaseDePruebas() {
  const base = nombreBasePruebas();
  const credenciales = credencialesBasePruebas();

  const conexion = await mysql.createConnection(credenciales);
  try {
    await conexion.query(
      `CREATE DATABASE IF NOT EXISTS \`${base}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await conexion.end();
  }

  // multipleStatements: cada archivo .sql contiene varias sentencias
  // (CREATE TABLE + CREATE INDEX), igual que el runner database/scripts.
  const poolPruebas = mysql.createPool({
    ...credenciales,
    database: base,
    multipleStatements: true,
  });

  // Registro idempotente de migraciones, igual que apply-migrations.mjs:
  // solo se aplican las que faltan (los CREATE INDEX no son repetibles).
  await poolPruebas.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const [aplicadas] = await poolPruebas.query(
    'SELECT filename FROM schema_migrations'
  );
  const yaAplicadas = new Set(aplicadas.map((fila) => fila.filename));

  const archivos = readdirSync(migrationsDir)
    .filter((archivo) => archivo.endsWith('.sql'))
    .sort();
  for (const archivo of archivos) {
    if (yaAplicadas.has(archivo)) {
      continue;
    }
    const sql = readFileSync(path.join(migrationsDir, archivo), 'utf8');
    await poolPruebas.query(sql);
    await poolPruebas.query(
      'INSERT INTO schema_migrations (filename) VALUES (?)',
      [archivo]
    );
  }

  // Las suites de pruebas usan este pool en lugar del pool de desarrollo.
  setPool(poolPruebas);
  return poolPruebas;
}

/** Vacía las tablas del sprint entre suites (orden respetando llaves foráneas). */
export async function limpiarTablas() {
  const { getPool } = await import('../../config/db.js');
  const pool = getPool();
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  await pool.query('DELETE FROM order_entries');
  await pool.query('DELETE FROM order_services');
  await pool.query('DELETE FROM order_labor');
  // Sprint 3: tablas nuevas, hijas antes que sus referenciadas.
  await pool.query('DELETE FROM order_parts');
  await pool.query('DELETE FROM inventory_movements');
  await pool.query('DELETE FROM maintenance_plans');
  await pool.query('DELETE FROM parts');
  // Sprint 4: pagos y tickets, antes de sus referenciadas.
  await pool.query('DELETE FROM payments');
  await pool.query('DELETE FROM tickets');
  await pool.query('DELETE FROM service_orders');
  await pool.query('DELETE FROM appointments');
  await pool.query('DELETE FROM vehicles');
  await pool.query('DELETE FROM clients');
  await pool.query('DELETE FROM users');
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
}

/** Cierra el pool de pruebas (llamar al final de la suite). */
export async function cerrarBaseDePruebas() {
  await closePool();
}
