#!/usr/bin/env node
/**
 * Runner idempotente de migraciones (T006, research D8).
 *
 * Aplica los scripts SQL de `database/migrations/` en orden numérico, los registra
 * en la tabla `schema_migrations` y omite los ya aplicados. Puede ejecutarse
 * tantas veces como sea necesario sin volver a aplicar lo ya aplicado.
 *
 * Uso (desde la raíz del repo o desde database/):
 *   node database/scripts/apply-migrations.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'migrations');

// El backend guarda sus variables en server/.env; se carga si existe.
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
    // Registro de migraciones aplicadas (idempotente).
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [appliedRows] = await connection.query(
      'SELECT filename FROM schema_migrations'
    );
    const applied = new Set(appliedRows.map((row) => row.filename));

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('No hay scripts de migración en database/migrations/.');
      return;
    }

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Omitida (ya aplicada): ${file}`);
        continue;
      }
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await connection.query(sql);
      await connection.query(
        'INSERT INTO schema_migrations (filename) VALUES (?)',
        [file]
      );
      console.log(`Migración aplicada: ${file}`);
    }

    console.log('Migraciones al día.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Error al aplicar migraciones:', error.message);
  process.exit(1);
});
