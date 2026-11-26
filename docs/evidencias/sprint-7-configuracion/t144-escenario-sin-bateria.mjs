#!/usr/bin/env node
/**
 * T144 (008-configuracion-seguridad-reportes, bloque P3): efecto de que la
 * refacción BAT-12V-60 NO exista al sembrar el seed 012 (es el caso de la base
 * `motorix` del usuario: el seed omitió ese uso de la orden 9103).
 *
 * Uso (desde la raíz del repositorio):
 *   node docs/evidencias/sprint-7-configuracion/t144-escenario-sin-bateria.mjs
 *
 * SOLO opera sobre `motorix_test` (se niega a correr en cualquier otra base) y la
 * deja vacía al terminar. Compara dos escenarios con los seeds 001–012:
 *   A) base completa (con BAT-12V-60);
 *   B) sin BAT-12V-60: antes del seed 012 se retiran la refacción y su movimiento
 *      de alta (el único que la referencia), como en `motorix`.
 * Todo lo que consulta es de solo lectura (API y SELECT). La API corre en el puerto 3058.
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from '../../../server/node_modules/dotenv/lib/main.js';
import mysql from '../../../server/node_modules/mysql2/promise.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
dotenv.config({ path: path.join(raiz, 'server', '.env') });

const BASE = 'motorix_test';
const PUERTO = 3058;
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

/** Aplica los seeds con el runner del repositorio; `hasta` y `desde` filtran por prefijo numérico. */
function sembrar(archivos) {
  for (const archivo of archivos) {
    const resultado = spawnSync(
      process.execPath,
      [
        '-e',
        `import('node:fs').then(async ({ readFileSync }) => {
          const m = await import(${JSON.stringify(new URL('../../../server/node_modules/mysql2/promise.js', import.meta.url).href)});
          const c = await m.default.createConnection({ host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: ${JSON.stringify(BASE)}, multipleStatements: true });
          await c.query(readFileSync(${JSON.stringify(path.join(raiz, 'database', 'seeds', archivo))}, 'utf8'));
          await c.end();
        })`,
      ],
      { env: process.env, encoding: 'utf8' }
    );
    if (resultado.status !== 0) {
      console.error(archivo, resultado.stderr);
      process.exit(1);
    }
  }
}

const SEEDS_PREVIOS = [
  '001_initial_accounts.sql',
  '002_demo_clients_vehicles.sql',
  '003_demo_appointments.sql',
  '004_demo_service_orders.sql',
  '005_demo_parts.sql',
  '006_demo_maintenances.sql',
  '007_demo_payments_tickets.sql',
  '008_demo_part_prices.sql',
  '009_demo_notifications.sql',
  '010_demo_settings_service_types.sql',
  '011_demo_terms.sql',
];

const URL_API = `http://localhost:${PUERTO}`;
async function api(ruta, token, metodo = 'GET', cuerpo) {
  const r = await fetch(`${URL_API}${ruta}`, {
    method: metodo,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: r.status, cuerpo: await r.json().catch(() => null) };
}

async function medir(conBateria) {
  await vaciar();
  sembrar(SEEDS_PREVIOS);
  if (!conBateria) {
    await conexion.query("DELETE FROM inventory_movements WHERE part_id IN (SELECT id FROM parts WHERE code = 'BAT-12V-60')");
    await conexion.query("DELETE FROM parts WHERE code = 'BAT-12V-60'");
  }
  sembrar(['012_demo_reports.sql']);

  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: path.join(raiz, 'server'),
    env: { ...process.env, DB_NAME: BASE, PORT: String(PUERTO) },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 60; i += 1) {
      try {
        if ((await api('/api/health')).status === 200) break;
      } catch {
        // aún no escucha
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const login = await api('/api/auth/login', null, 'POST', { identificacion: 'admin', contrasena: 'Admin123' });
    const token = login.cuerpo.token;
    const vigente = await api('/api/terms/current', token);
    await api('/api/terms/accept', token, 'POST', { termsVersionId: vigente.cuerpo.vigente.id });

    const r = {};
    const [[mov]] = await conexion.query('SELECT COUNT(*) AS n FROM inventory_movements WHERE id BETWEEN 9101 AND 9120');
    const [[usos]] = await conexion.query('SELECT COUNT(*) AS n FROM order_parts WHERE id BETWEEN 9101 AND 9110');
    r.sembrado = { movimientos: Number(mov.n), usos: Number(usos.n) };
    for (const periodo of ['MES_ANTERIOR', 'MES_ACTUAL']) {
      const partes = (await api(`/api/reports/parts?periodo=${periodo}&limite=100`, token)).cuerpo;
      const rotacion = (await api(`/api/reports/rotation?periodo=${periodo}&limite=100`, token)).cuerpo;
      const ingresos = (await api(`/api/reports/income?periodo=${periodo}`, token)).cuerpo;
      const servicios = (await api(`/api/reports/services?periodo=${periodo}`, token)).cuerpo;
      const productividad = (await api(`/api/reports/productivity?periodo=${periodo}`, token)).cuerpo;
      r[periodo] = {
        ingresosCentavos: ingresos.totalCentavos,
        servicios: servicios.datos.map((d) => `${d.tipo}:${d.cantidad}:${d.importeCentavos}`).join(' | '),
        productividad: productividad.datos.map((d) => `${d.mecanico?.nombre ?? 'Sin asignar'}:${d.ordenes}:${d.manoObraCentavos}`).join(' | '),
        refacciones: { lineas: partes.total, totales: partes.totales, codigos: partes.datos.map((d) => d.codigo).join(',') },
        rotacion: { refaccionesActivas: rotacion.total, filas: rotacion.datos.map((d) => `${d.codigo}:${d.unidadesSalidas}/${d.existencia}=${d.rotacion}`).join(' | ') },
      };
    }
    const orden = (await api('/api/orders/9103', token)).cuerpo;
    r.orden9103 = orden?.totals ?? orden;
    return r;
  } finally {
    servidor.kill();
  }
}

const A = await medir(true);
const B = await medir(false);
await vaciar();
await conexion.end();

console.log('=== A) Base completa (con BAT-12V-60) ===');
console.log(JSON.stringify(A, null, 1));
console.log('\n=== B) Sin BAT-12V-60 (como la base motorix del usuario) ===');
console.log(JSON.stringify(B, null, 1));
console.log('\nmotorix_test quedó vacía otra vez.');
