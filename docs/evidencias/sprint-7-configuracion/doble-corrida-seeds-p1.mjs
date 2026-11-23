#!/usr/bin/env node
/**
 * Verificación de idempotencia de los seeds del bloque P1 del Sprint 7
 * (008-configuracion-seguridad-reportes, T049, CA-12).
 *
 * Uso (desde la raíz del repositorio):
 *   node docs/evidencias/sprint-7-configuracion/doble-corrida-seeds-p1.mjs
 *
 * Precondición: `motorix_test` con las migraciones 001-021 aplicadas y VACÍA de
 * datos (las pruebas de Jest la dejan así). El script SOLO opera sobre
 * `motorix_test`: se niega a correr sobre cualquier otra base. Pasos:
 *   1) aplica los seeds 001-010 dos veces y compara los conteos por tabla;
 *   2) cambia un ajuste y renombra un tipo de servicio, vuelve a sembrar y
 *      comprueba que NO se pisan (el seed nunca reinicia lo que cambió el usuario);
 *   3) deja `motorix_test` vacía otra vez para no afectar a las pruebas.
 * Código de salida 0 solo si todo coincide.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from '../../../server/node_modules/dotenv/lib/main.js';
import mysql from '../../../server/node_modules/mysql2/promise.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
dotenv.config({ path: path.join(raiz, 'server', '.env') });

const BASE = 'motorix_test';
if ((process.env.DB_TEST_NAME ?? BASE) !== BASE) {
  console.error(`Se niega a correr: la base de pruebas configurada no es ${BASE}.`);
  process.exit(2);
}

const conexion = await mysql.createConnection({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: BASE,
  multipleStatements: true,
});

let fallas = 0;
function verificar(condicion, texto, detalle = '') {
  console.log(`${condicion ? 'OK   ' : 'FALLA'} ${texto}${condicion ? '' : ` -> ${detalle}`}`);
  if (!condicion) fallas += 1;
}

async function conteos() {
  const [tablas] = await conexion.query(
    "SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name",
    [BASE]
  );
  const resultado = {};
  for (const { nombre } of tablas) {
    const [[fila]] = await conexion.query(`SELECT COUNT(*) AS total FROM \`${nombre}\``);
    resultado[nombre] = Number(fila.total);
  }
  return resultado;
}

/** Vacía las tablas de datos de motorix_test y reinicia sus contadores (como una base nueva). */
async function vaciar() {
  const [tablas] = await conexion.query(
    "SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'",
    [BASE]
  );
  await conexion.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { nombre } of tablas) {
    await conexion.query(`DELETE FROM \`${nombre}\``);
    await conexion.query(`ALTER TABLE \`${nombre}\` AUTO_INCREMENT = 1`);
  }
  await conexion.query('SET FOREIGN_KEY_CHECKS = 1');
}

/** Aplica los seeds con el runner del repositorio, forzando la base de pruebas. */
function sembrar() {
  const resultado = spawnSync(process.execPath, [path.join(raiz, 'database', 'scripts', 'apply-seeds.mjs')], {
    env: { ...process.env, DB_NAME: BASE },
    encoding: 'utf8',
  });
  if (resultado.status !== 0) {
    console.error(resultado.stdout, resultado.stderr);
  }
  return resultado.status === 0;
}

const [[migracion]] = await conexion.query(
  "SELECT COUNT(*) AS total FROM schema_migrations WHERE filename IN ('019_create_settings.sql', '020_create_service_types.sql', '021_tickets_shop_snapshot.sql')"
);
verificar(Number(migracion.total) === 3, 'motorix_test tiene aplicadas las migraciones 019-021', String(migracion.total));
const previos = await conteos();
const hayDatos = Object.entries(previos).some(([tabla, total]) => tabla !== 'schema_migrations' && total > 0);
if (hayDatos && !process.argv.includes('--vaciar')) {
  console.error('motorix_test tiene datos. Vuelva a ejecutar con --vaciar para vaciarla (solo esa base).');
  await conexion.end();
  process.exit(1);
}
// Los seeds fijan IDs 1-4 de vehículos: la base de pruebas debe empezar como una
// base nueva (vacía y con los contadores en 1), porque las pruebas de Jest los avanzan.
await vaciar();
verificar(true, 'motorix_test se vació y sus contadores se reiniciaron (base de pruebas desechable)');

console.log('--- Corrida 1 de seeds 001-010 ---');
verificar(sembrar(), 'los seeds se aplican sin error (corrida 1)');
const uno = await conteos();
console.log(JSON.stringify(uno));

console.log('--- Corrida 2 de seeds 001-010 ---');
verificar(sembrar(), 'los seeds se aplican sin error (corrida 2)');
const dos = await conteos();
console.log(JSON.stringify(dos));
verificar(JSON.stringify(uno) === JSON.stringify(dos), 'los conteos por tabla son idénticos entre corridas');

verificar(uno.settings === 7, 'settings tiene 7 filas', String(uno.settings));
verificar(uno.service_types === 4, 'service_types tiene 4 filas', String(uno.service_types));
const [tipos] = await conexion.query('SELECT id, name FROM service_types ORDER BY id');
verificar(
  JSON.stringify(tipos.map((t) => t.id)) === '[1,2,3,4]',
  'los tipos de servicio usan IDs normales desde 1 (tabla nueva)',
  JSON.stringify(tipos)
);
const [[orden]] = await conexion.query(
  `SELECT o.status, s.service_type_id, t.name AS tipo
   FROM service_orders o
   JOIN order_services s ON s.order_id = o.id
   LEFT JOIN service_types t ON t.id = s.service_type_id
   WHERE o.id = 9001`
);
verificar(orden?.status === 'ENTREGADO' && orden?.tipo === 'Cambio de aceite', 'la orden 9001 está ENTREGADO con una línea tipo «Cambio de aceite»', JSON.stringify(orden));
const [[ticket]] = await conexion.query('SELECT folio, shop_name FROM tickets WHERE id = 9001');
verificar(ticket?.shop_name === 'Motorix', 'el ticket 9001 tiene instantánea del taller', JSON.stringify(ticket));
const [[viejo]] = await conexion.query('SELECT shop_name FROM tickets WHERE id = 1');
verificar(viejo?.shop_name === null, 'el ticket 1 (de un sprint anterior) sigue SIN instantánea', JSON.stringify(viejo));

console.log('--- El seed no pisa lo que cambió el administrador ---');
await conexion.query("UPDATE settings SET setting_value = '45' WHERE setting_key = 'maintenance.margin_days'");
await conexion.query("UPDATE service_types SET name = 'Afinación mayor', interval_days = 200 WHERE id = 2");
verificar(sembrar(), 'los seeds se aplican sin error (corrida 3)');
const [[ajuste]] = await conexion.query("SELECT setting_value FROM settings WHERE setting_key = 'maintenance.margin_days'");
const [[tipo2]] = await conexion.query('SELECT name, interval_days FROM service_types WHERE id = 2');
verificar(ajuste.setting_value === '45', 'un ajuste cambiado se conserva tras volver a sembrar', ajuste.setting_value);
verificar(tipo2.name === 'Afinación mayor' && tipo2.interval_days === 200, 'un tipo editado se conserva tras volver a sembrar', JSON.stringify(tipo2));
const tres = await conteos();
verificar(JSON.stringify(tres) === JSON.stringify(dos), 'los conteos siguen idénticos tras la corrida 3');

await vaciar();
const final = await conteos();
verificar(
  Object.entries(final).every(([tabla, total]) => tabla === 'schema_migrations' || total === 0),
  'motorix_test quedó vacía otra vez'
);
await conexion.end();

console.log(fallas === 0 ? 'Resultado: TODO OK' : `Resultado: ${fallas} verificación(es) fallaron`);
process.exit(fallas === 0 ? 0 : 1);
