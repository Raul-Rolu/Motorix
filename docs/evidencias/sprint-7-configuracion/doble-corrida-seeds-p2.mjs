#!/usr/bin/env node
/**
 * Verificación de la doble corrida de los seeds del bloque P2 del Sprint 7
 * (008-configuracion-seguridad-reportes, T097, CA-12, CA-16, CA-18).
 *
 * Uso (desde la raíz del repositorio):
 *   node docs/evidencias/sprint-7-configuracion/doble-corrida-seeds-p2.mjs [--vaciar]
 *
 * Precondición: `motorix_test` con las migraciones 001-023 aplicadas y VACÍA de
 * datos (las pruebas de Jest la dejan así). Si tiene datos, el script se detiene
 * y pide volver a ejecutarlo con `--vaciar`. SOLO opera sobre `motorix_test`: se
 * niega a correr sobre cualquier otra base y arranca la API de esa misma base en
 * el puerto 3056. Pasos:
 *   1) aplica los seeds 001-011 dos veces y compara los conteos por tabla;
 *   2) comprueba la versión 1 de los términos, la ausencia de aceptaciones y las
 *      cuatro entradas de bitácora;
 *   3) con la API, cada cuenta de demostración ve la compuerta en su primer inicio
 *      de sesión y no se repite tras aceptar;
 *   4) vuelve a sembrar con aceptaciones hechas y con una versión publicada por
 *      el administrador: no se pisa nada;
 *   5) deja `motorix_test` vacía otra vez para no afectar a las pruebas.
 * Código de salida 0 solo si todo coincide.
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from '../../../server/node_modules/dotenv/lib/main.js';
import mysql from '../../../server/node_modules/mysql2/promise.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
dotenv.config({ path: path.join(raiz, 'server', '.env') });

const BASE = 'motorix_test';
const PUERTO = 3056;
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

const URL_API = `http://localhost:${PUERTO}`;
async function api(metodo, ruta, token, cuerpo) {
  const respuesta = await fetch(`${URL_API}${ruta}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { status: respuesta.status, cuerpo: await respuesta.json().catch(() => null) };
}

async function arrancarApi() {
  const proceso = spawn(process.execPath, ['server.js'], {
    cwd: path.join(raiz, 'server'),
    env: { ...process.env, DB_NAME: BASE, PORT: String(PUERTO) },
    stdio: 'ignore',
  });
  for (let intento = 0; intento < 60; intento += 1) {
    try {
      const salud = await api('GET', '/api/health');
      if (salud.status === 200) return proceso;
    } catch {
      // aún no escucha
    }
    await new Promise((resolver) => setTimeout(resolver, 500));
  }
  proceso.kill();
  throw new Error('La API no arrancó a tiempo.');
}

// --- Precondiciones ---------------------------------------------------------
const [[migraciones]] = await conexion.query(
  "SELECT COUNT(*) AS total FROM schema_migrations WHERE filename IN ('022_create_audit_log.sql', '023_create_terms.sql')"
);
verificar(Number(migraciones.total) === 2, 'motorix_test tiene aplicadas las migraciones 022 y 023', String(migraciones.total));
const previos = await conteos();
const hayDatos = Object.entries(previos).some(([tabla, total]) => tabla !== 'schema_migrations' && total > 0);
if (hayDatos && !process.argv.includes('--vaciar')) {
  console.error('motorix_test tiene datos. Vuelva a ejecutar con --vaciar para vaciarla (solo esa base).');
  await conexion.end();
  process.exit(1);
}
await vaciar();
verificar(true, 'motorix_test está vacía y con los contadores en 1 (base de pruebas desechable)');

// --- Doble corrida ----------------------------------------------------------
console.log('--- Corrida 1 de seeds 001-011 ---');
verificar(sembrar(), 'los seeds se aplican sin error (corrida 1)');
const uno = await conteos();
console.log(JSON.stringify(uno));

console.log('--- Corrida 2 de seeds 001-011 ---');
verificar(sembrar(), 'los seeds se aplican sin error (corrida 2)');
const dos = await conteos();
console.log(JSON.stringify(dos));
verificar(JSON.stringify(uno) === JSON.stringify(dos), 'los conteos por tabla son idénticos entre corridas');

// --- Contenido sembrado -----------------------------------------------------
const [versiones] = await conexion.query('SELECT id, version, terms_text, privacy_text, published_by FROM terms_versions');
verificar(versiones.length === 1 && versiones[0].id === 1 && versiones[0].version === 1, 'una sola versión de términos: id 1, versión 1', JSON.stringify(versiones.map((v) => [v.id, v.version])));
verificar(uno.terms_acceptances === 0, 'no hay ninguna aceptación sembrada', String(uno.terms_acceptances));
verificar(/plantilla/i.test(versiones[0]?.terms_text) && /plantilla/i.test(versiones[0]?.privacy_text), 'ambos textos advierten que son una plantilla');
const [entradas] = await conexion.query('SELECT id, action, user_id, detail, created_at FROM audit_log ORDER BY id');
verificar(
  entradas.length === 4 && JSON.stringify(entradas.map((e) => e.id)) === '[1,2,3,4]',
  'la bitácora tiene las cuatro entradas de ejemplo con los ids 1 a 4',
  JSON.stringify(entradas.map((e) => e.id))
);
verificar(
  entradas.every((e) => Date.now() - new Date(e.created_at).getTime() < 7 * 86400000),
  'las entradas de ejemplo tienen fechas relativas (de los últimos 7 días)'
);
verificar(uno.settings === 7 && uno.service_types === 4, 'los seeds del bloque P1 siguen intactos (7 ajustes y 4 tipos)', `${uno.settings}/${uno.service_types}`);

// --- Compuerta con las cuentas de demostración (API real sobre motorix_test) ---
const cuentas = [
  ['admin', 'Admin123'],
  ['recepcion', 'Recepcion123'],
  ['mecanico', 'Mecanico123'],
];
const servidor = await arrancarApi();
let tokenAdmin = null;
try {
  console.log('--- Compuerta de términos por la API ---');
  for (const [usuario, clave] of cuentas) {
    const login = await api('POST', '/api/auth/login', null, { identificacion: usuario, contrasena: clave });
    const token = login.cuerpo?.token;
    verificar(Boolean(token), `${usuario}: inicia sesión`);

    const bloqueado = await api('GET', '/api/me', token);
    verificar(bloqueado.status === 403 && bloqueado.cuerpo?.error?.codigo === 'TERMS_NOT_ACCEPTED', `${usuario}: en su primer inicio de sesión recibe 403 TERMS_NOT_ACCEPTED`, JSON.stringify(bloqueado));

    const vigente = await api('GET', '/api/terms/current', token);
    verificar(vigente.status === 200 && vigente.cuerpo?.aceptada === false && vigente.cuerpo?.vigente?.version === 1, `${usuario}: ve la versión 1 sin aceptar`, JSON.stringify(vigente.cuerpo?.aceptada));
    const renovar = await api('POST', '/api/auth/renew', token);
    verificar(renovar.status === 200, `${usuario}: la renovación del token sigue permitida sin aceptar`, String(renovar.status));

    const aceptar = await api('POST', '/api/terms/accept', token, { termsVersionId: vigente.cuerpo?.vigente?.id });
    verificar(aceptar.status === 200, `${usuario}: acepta la versión 1`, String(aceptar.status));

    const segundo = await api('POST', '/api/auth/login', null, { identificacion: usuario, contrasena: clave });
    const libre = await api('GET', '/api/me', segundo.cuerpo?.token);
    verificar(libre.status === 200, `${usuario}: en un inicio de sesión posterior ya no se vuelve a pedir`, String(libre.status));
    if (usuario === 'admin') tokenAdmin = segundo.cuerpo?.token;
  }

  const bitacora = await api('GET', '/api/audit-log', tokenAdmin);
  verificar(bitacora.status === 200 && bitacora.cuerpo?.total === 4, 'el administrador ve las cuatro entradas en la bitácora', JSON.stringify(bitacora.cuerpo?.total));
  const aceptaciones = await api('GET', '/api/terms/acceptances', tokenAdmin);
  verificar(aceptaciones.status === 200 && aceptaciones.cuerpo?.total === 3, 'hay tres aceptaciones (una por cuenta)', JSON.stringify(aceptaciones.cuerpo?.total));

  // --- El seed no pisa lo hecho ---------------------------------------------
  console.log('--- El seed no pisa lo que hizo el usuario ---');
  verificar(sembrar(), 'los seeds se aplican sin error (corrida 3, con aceptaciones hechas)');
  const [[aceptadas]] = await conexion.query('SELECT COUNT(*) AS total FROM terms_acceptances');
  verificar(Number(aceptadas.total) === 3, 'las tres aceptaciones se conservan', String(aceptadas.total));
  const [[conBitacora]] = await conexion.query('SELECT COUNT(*) AS total FROM audit_log');
  verificar(Number(conBitacora.total) === 4, 'la bitácora sigue con 4 entradas (sin repetir los ejemplos)', String(conBitacora.total));

  const publicar = await api('POST', '/api/terms', tokenAdmin, {
    terminos: 'Términos propios del taller, versión dos, publicados por el administrador.',
    avisoPrivacidad: 'Aviso de privacidad propio del taller, versión dos.',
  });
  verificar(publicar.status === 201 && publicar.cuerpo?.version === 2, 'el administrador publica su versión 2', JSON.stringify(publicar.cuerpo));
  verificar(sembrar(), 'los seeds se aplican sin error (corrida 4, con una versión propia publicada)');
  const [filasVersiones] = await conexion.query('SELECT version, terms_text FROM terms_versions ORDER BY version');
  verificar(
    filasVersiones.length === 2 && filasVersiones[1].terms_text.startsWith('Términos propios del taller'),
    'no se siembra otra versión ni se modifica la publicada por el administrador',
    JSON.stringify(filasVersiones.map((v) => v.version))
  );
} finally {
  servidor.kill();
}

await vaciar();
const final = await conteos();
verificar(
  Object.entries(final).every(([tabla, total]) => tabla === 'schema_migrations' || total === 0),
  'motorix_test quedó vacía otra vez'
);
await conexion.end();

console.log(fallas === 0 ? 'Resultado: TODO OK' : `Resultado: ${fallas} verificación(es) fallaron`);
process.exit(fallas === 0 ? 0 : 1);
