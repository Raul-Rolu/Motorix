#!/usr/bin/env node
/**
 * Runner idempotente de seeds (T007, FR-012).
 *
 * Ejecuta los scripts SQL de `database/seeds/` en orden numérico. Los seeds usan
 * claves únicas y `INSERT ... ON DUPLICATE KEY UPDATE`, por lo que pueden
 * re-ejecutarse sin duplicar registros. La base nunca queda vacía tras la
 * instalación inicial.
 *
 * Uso:
 *   node database/scripts/apply-seeds.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedsDir = path.join(__dirname, '..', 'seeds');

dotenv.config({ path: path.join(__dirname, '..', '..', 'server', '.env') });

const host = process.env.DB_HOST ?? 'localhost';
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_NAME;

if (!user || !database) {
  console.error(
    'Faltan variables de entorno: DB_USER y DB_NAME son obligatorias. ' +
      'Copia server/.env.example a server/.env y complétalo.'
  );
  process.exit(1);
}

async function main() {
  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,
  });

  try {
    const files = (await readdir(seedsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No hay scripts de seeds en database/seeds/.');
      return;
    }

    for (const file of files) {
      const sql = await readFile(path.join(seedsDir, file), 'utf8');
      await connection.query(sql);
      console.log(`Seed aplicado (idempotente): ${file}`);
    }

    console.log('Seeds aplicados. La base cuenta con datos de ejemplo.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Error al aplicar seeds:', error.message);
  process.exit(1);
});
