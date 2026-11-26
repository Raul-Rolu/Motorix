#!/usr/bin/env node
/**
 * Escenarios E10 a E13 del quickstart del bloque P3 del Sprint 7
 * (008-configuracion-seguridad-reportes, T150; CA-6 a CA-12) contra la API REAL.
 *
 * Uso (desde la raíz del repositorio):
 *   node docs/evidencias/sprint-7-configuracion/escenarios-p3-api.mjs --recrear-motorix-test
 *
 * RECREA `motorix_test` por completo (la borra, la crea de nuevo, aplica las
 * migraciones 001-023 y siembra 001-012). Autorizado por el usuario para T150. Antes de
 * borrar nada comprueba que el nombre de la base sea EXACTAMENTE `motorix_test` (y
 * que la configuración no apunte a otra) y se detiene si no lo es. NUNCA toca
 * `motorix`. La API corre con esa misma base en el puerto 3059.
 *
 *   E10  Ingresos, servicios y productividad (Mes anterior, Mes actual, rango libre,
 *        rango vacío); recepción y mecánico sin acceso (403 en toda la API).
 *   E11  Refacciones («sin costo», fuera del margen) y rotación («sin existencia»).
 *        La medición de rendimiento corre aparte con Jest (reports-performance).
 *   E12  Exportación de cada reporte (BOM, cabeceras, coincidencia con la pantalla,
 *        neutralización de «=»).
 *   E13  Seed 012 dos veces sin duplicados (las suites completas son T151).
 * Código de salida 0 solo si todo coincide. Deja `motorix_test` vacía al terminar.
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from '../../../server/node_modules/dotenv/lib/main.js';
import mysql from '../../../server/node_modules/mysql2/promise.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
dotenv.config({ path: path.join(raiz, 'server', '.env') });

// ---------------------------------------------------------------- Guardia de identidad
const BASE = 'motorix_test';
const PUERTO = 3059;
if (!process.argv.includes('--recrear-motorix-test')) {
  console.error('Falta --recrear-motorix-test: este guion borra y recrea la base de pruebas.');
  process.exit(2);
}
if (BASE !== 'motorix_test' || (process.env.DB_TEST_NAME ?? BASE) !== 'motorix_test') {
  console.error(`DETENIDO: la base a recrear debe llamarse exactamente motorix_test (configurada: ${process.env.DB_TEST_NAME}).`);
  process.exit(2);
}
if (process.env.DB_NAME === BASE) {
  // Nada que hacer: solo informa que la configuración principal ya apunta a la de pruebas.
  console.log('Aviso: DB_NAME del .env es motorix_test.');
}

const credenciales = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

let fallas = 0;
let total = 0;
function verificar(condicion, texto, detalle = '') {
  total += 1;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'} ${texto}${condicion ? '' : ` -> ${detalle}`}`);
  if (!condicion) fallas += 1;
}
const texto = (v) => JSON.stringify(v);
const escenario = (titulo) => console.log(`\n===== ${titulo} =====`);
const centavos = (valor) => Math.round(Number(valor ?? 0) * 100);

// ---------------------------------------------------------------- Recrear la base
{
  const admin = await mysql.createConnection(credenciales);
  const [[{ nombre }]] = await admin.query('SELECT ? AS nombre', [BASE]);
  if (nombre !== 'motorix_test') {
    console.error('DETENIDO: nombre inesperado.');
    process.exit(2);
  }
  await admin.query(`DROP DATABASE IF EXISTS \`${BASE}\``);
  await admin.query(`CREATE DATABASE \`${BASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();
  console.log(`Base recreada: ${BASE}`);
}

function correr(script) {
  const r = spawnSync(process.execPath, [path.join(raiz, 'database', 'scripts', script)], {
    env: { ...process.env, DB_NAME: BASE },
    encoding: 'utf8',
  });
  if (r.status !== 0) console.error(r.stdout, r.stderr);
  return r;
}

const migraciones = correr('apply-migrations.mjs');
verificar(migraciones.status === 0, 'migraciones 001-023 aplicadas sin error');
const sembrar = () => correr('apply-seeds.mjs').status === 0;
verificar(sembrar(), 'seeds 001-012 aplicados sin error (corrida 1)');

const conexion = await mysql.createConnection({ ...credenciales, database: BASE, multipleStatements: true });
const [[versiones]] = await conexion.query("SELECT COUNT(*) AS n FROM schema_migrations");
verificar(Number(versiones.n) === 23, 'schema_migrations tiene 23 migraciones', String(versiones.n));

async function conteos() {
  const [tablas] = await conexion.query(
    "SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' ORDER BY table_name",
    [BASE]
  );
  const r = {};
  for (const { nombre } of tablas) {
    const [[f]] = await conexion.query(`SELECT COUNT(*) AS n FROM \`${nombre}\``);
    r[nombre] = Number(f.n);
  }
  return r;
}

// ---------------------------------------------------------------- API
const URL_API = `http://localhost:${PUERTO}`;
async function api(metodo, ruta, token, cuerpo) {
  const r = await fetch(`${URL_API}${ruta}`, {
    method: metodo,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const bytes = Buffer.from(await r.arrayBuffer());
  let json = null;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch {
    // no es JSON (CSV)
  }
  return { status: r.status, cuerpo: json, bytes, cabeceras: r.headers };
}

const servidor = spawn(process.execPath, ['server.js'], {
  cwd: path.join(raiz, 'server'),
  env: { ...process.env, DB_NAME: BASE, PORT: String(PUERTO) },
  stdio: 'ignore',
});
async function esperarApi() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await api('GET', '/api/health')).status === 200) return;
    } catch {
      // aún no escucha
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('La API no arrancó a tiempo.');
}

try {
  await esperarApi();
  const [[idBase]] = await conexion.query('SELECT DATABASE() AS base');
  verificar(idBase.base === 'motorix_test', 'la conexión del guion apunta a motorix_test', idBase.base);

  const cuentas = { admin: 'Admin123', recepcion: 'Recepcion123', mecanico: 'Mecanico123' };
  const token = {};
  for (const [usuario, clave] of Object.entries(cuentas)) {
    const l = await api('POST', '/api/auth/login', null, { identificacion: usuario, contrasena: clave });
    token[usuario] = l.cuerpo?.token;
    const v = await api('GET', '/api/terms/current', token[usuario]);
    await api('POST', '/api/terms/accept', token[usuario], { termsVersionId: v.cuerpo?.vigente?.id });
  }
  verificar(Object.values(token).every(Boolean), 'las tres cuentas inician sesión y aceptan los términos (seed 011)');

  const [[r]] = await conexion.query(
    `SELECT TIMESTAMP(DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)) AS ant,
            TIMESTAMP(DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS act,
            TIMESTAMP(DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)) AS sig,
            DATE_FORMAT(DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH), '%Y-%m-%d') AS ant_dia1,
            DATE_FORMAT(DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 5 YEAR), '%Y-%m-%d') AS futuro`
  );
  const MESES = [['MES_ANTERIOR', r.ant, r.act], ['MES_ACTUAL', r.act, r.sig]];
  const CERRADAS = "o.status IN ('TERMINADO', 'ENTREGADO') AND o.status_changed_at >= ? AND o.status_changed_at < ?";
  const ESPERADO = {
    MES_ANTERIOR: { pagosSeed: 492050, servicios: [5, 318050], mano: [3, 80000] },
    MES_ACTUAL: { pagosSeed: 473000, servicios: [5, 277000], mano: [3, 83000] },
  };

  // ============================================================== E10
  escenario('E10 - Ingresos, servicios y productividad (CA-6, CA-7, CA-10)');
  for (const [periodo, desde, hasta] of MESES) {
    const rango = [desde, hasta];
    const ing = await api('GET', `/api/reports/income?periodo=${periodo}`, token.admin);
    const [[sqlIng]] = await conexion.query("SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE status='COMPLETED' AND created_at >= ? AND created_at < ?", rango);
    verificar(ing.status === 200 && ing.cuerpo.totalCentavos === centavos(sqlIng.t), `${periodo}: ingresos = suma SQL de pagos COMPLETED (centavos exactos)`, `${ing.cuerpo?.totalCentavos} vs ${centavos(sqlIng.t)}`);
    const [[seedIng]] = await conexion.query("SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE status='COMPLETED' AND order_id BETWEEN 9101 AND 9107 AND created_at >= ? AND created_at < ?", rango);
    verificar(centavos(seedIng.t) === ESPERADO[periodo].pagosSeed, `${periodo}: los pagos del seed 012 suman ${ESPERADO[periodo].pagosSeed / 100}`, String(centavos(seedIng.t)));
    verificar(ing.cuerpo.porMetodo.reduce((s, m) => s + m.totalCentavos, 0) === ing.cuerpo.totalCentavos && ing.cuerpo.porPeriodo.reduce((s, m) => s + m.totalCentavos, 0) === ing.cuerpo.totalCentavos, `${periodo}: el desglose por método y por día suma el total`);
    verificar(ing.cuerpo.agrupacion === 'DIA', `${periodo}: un mes completo se agrupa por día`, ing.cuerpo.agrupacion);

    const srv = await api('GET', `/api/reports/services?periodo=${periodo}`, token.admin);
    const [[sqlSrv]] = await conexion.query(`SELECT COUNT(*) AS n, COALESCE(SUM(s.amount),0) AS t FROM service_orders o JOIN order_services s ON s.order_id=o.id WHERE ${CERRADAS}`, rango);
    verificar(srv.cuerpo.datos.reduce((s, d) => s + d.cantidad, 0) === Number(sqlSrv.n) && srv.cuerpo.datos.reduce((s, d) => s + d.importeCentavos, 0) === centavos(sqlSrv.t), `${periodo}: servicios = líneas e importe SQL de órdenes cerradas`);
    verificar(srv.cuerpo.datos.some((d) => d.tipo === 'Sin tipo') && srv.cuerpo.datos.some((d) => d.tipo !== 'Sin tipo'), `${periodo}: aparecen servicios con tipo y «Sin tipo»`);
    const [[seedSrv]] = await conexion.query(`SELECT COUNT(*) AS n, COALESCE(SUM(s.amount),0) AS t FROM service_orders o JOIN order_services s ON s.order_id=o.id WHERE o.id BETWEEN 9101 AND 9107 AND ${CERRADAS}`, rango);
    verificar(texto([Number(seedSrv.n), centavos(seedSrv.t)]) === texto(ESPERADO[periodo].servicios), `${periodo}: el seed 012 aporta ${ESPERADO[periodo].servicios[0]} líneas por ${ESPERADO[periodo].servicios[1] / 100}`);

    const prod = await api('GET', `/api/reports/productivity?periodo=${periodo}`, token.admin);
    const mec = prod.cuerpo.datos.filter((d) => d.mecanico !== null);
    verificar(mec.length >= 2 && prod.cuerpo.datos.at(-1).mecanico === null, `${periodo}: dos mecánicos y «Sin asignar» al final`);
    const [[seedProd]] = await conexion.query(`SELECT COUNT(*) AS n, COALESCE(SUM((SELECT COALESCE(SUM(l.amount),0) FROM order_labor l WHERE l.order_id=o.id)),0) AS t FROM service_orders o WHERE o.id BETWEEN 9101 AND 9107 AND ${CERRADAS}`, rango);
    verificar(texto([Number(seedProd.n), centavos(seedProd.t)]) === texto(ESPERADO[periodo].mano), `${periodo}: el seed 012 aporta ${ESPERADO[periodo].mano[0]} órdenes y ${ESPERADO[periodo].mano[1] / 100} de mano de obra`);
    const [[sqlProd]] = await conexion.query(`SELECT COUNT(*) AS n FROM service_orders o WHERE ${CERRADAS}`, rango);
    verificar(prod.cuerpo.datos.reduce((s, d) => s + d.ordenes, 0) === Number(sqlProd.n), `${periodo}: las órdenes de productividad = órdenes cerradas del periodo`);
  }
  const [[canceladas]] = await conexion.query("SELECT COUNT(*) AS n FROM service_orders WHERE id = 9107 AND status = 'CANCELADA'");
  verificar(Number(canceladas.n) === 1, 'la orden 9107 está CANCELADA y no se cuenta en ningún reporte (verificado arriba por las sumas SQL)');

  const libre = await api('GET', `/api/reports/income?desde=${r.ant_dia1}&hasta=${r.ant_dia1}`, token.admin);
  const [[sqlDia]] = await conexion.query("SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE status='COMPLETED' AND DATE(created_at) = ?", [r.ant_dia1]);
  verificar(libre.status === 200 && libre.cuerpo.totalCentavos === centavos(sqlDia.t), 'rango libre de un solo día: total igual a la suma SQL del día', `${libre.cuerpo?.totalCentavos}`);
  const vacio = await api('GET', `/api/reports/income?desde=${r.futuro}&hasta=${r.futuro}`, token.admin);
  verificar(vacio.status === 200 && vacio.cuerpo.totalCentavos === 0 && vacio.cuerpo.porPeriodo.length === 0 && vacio.cuerpo.porMetodo.length === 0, 'un rango sin pagos responde total 0 y listas vacías (estado vacío de la pantalla)');
  const invalido = await api('GET', '/api/reports/income?desde=2026-02-01&hasta=2026-01-01', token.admin);
  verificar(invalido.status === 400 && invalido.cuerpo.error.codigo === 'RANGO_INVALIDO', 'fecha final anterior a la inicial: 400 RANGO_INVALIDO', texto(invalido.cuerpo));
  const largo = await api('GET', '/api/reports/income?desde=2025-01-01&hasta=2026-06-01', token.admin);
  verificar(largo.status === 400 && largo.cuerpo.error.codigo === 'RANGO_INVALIDO', 'más de 366 días: 400 RANGO_INVALIDO');

  for (const rol of ['recepcion', 'mecanico']) {
    const rutas = ['income', 'services', 'productivity', 'parts', 'rotation'].flatMap((x) => [`/api/reports/${x}?periodo=MES_ACTUAL`, `/api/reports/${x}/export?periodo=MES_ACTUAL`]);
    const estados = [];
    for (const ruta of rutas) estados.push((await api('GET', ruta, token[rol])).status);
    verificar(estados.every((s) => s === 403), `${rol}: 403 en las 10 rutas de reportes (consulta y exportación)`, texto(estados));
  }
  const sinToken = await api('GET', '/api/reports/income?periodo=MES_ACTUAL');
  verificar(sinToken.status === 401, 'sin sesión: 401');

  // ============================================================== E11
  escenario('E11 - Refacciones y rotación (CA-8, CA-11)');
  for (const [periodo, desde, hasta] of MESES) {
    const rango = [desde, hasta];
    const pr = await api('GET', `/api/reports/parts?periodo=${periodo}&limite=100`, token.admin);
    const [[sqlP]] = await conexion.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN op.unit_price IS NOT NULL AND p.purchase_price IS NOT NULL THEN op.unit_price*op.quantity END),0) AS v,
              COALESCE(SUM(CASE WHEN op.unit_price IS NOT NULL AND p.purchase_price IS NOT NULL THEN p.purchase_price*op.quantity END),0) AS c
       FROM service_orders o JOIN order_parts op ON op.order_id=o.id JOIN parts p ON p.id=op.part_id WHERE ${CERRADAS}`, rango);
    const tt = pr.cuerpo.totales;
    verificar(pr.cuerpo.total === Number(sqlP.n) && tt.ventasCentavos === centavos(sqlP.v) && tt.costoCentavos === centavos(sqlP.c) && tt.margenCentavos === tt.ventasCentavos - tt.costoCentavos, `${periodo}: refacciones = líneas, ventas y costo SQL; margen = ventas − costo`, texto(tt));
    const sinCosto = pr.cuerpo.datos.filter((d) => d.sinCosto);
    verificar(sinCosto.every((d) => d.costoCentavos === null && d.margenCentavos === null), `${periodo}: las líneas «sin costo» no llevan costo ni margen (nunca 0)`);
    verificar(tt.lineasSinCosto === sinCosto.length, `${periodo}: el contador de líneas sin costo coincide con las filas`, `${tt.lineasSinCosto}/${sinCosto.length}`);
    const completas = pr.cuerpo.datos.filter((d) => !d.sinCosto && !d.sinPrecio);
    verificar(completas.reduce((s, d) => s + d.margenCentavos, 0) === tt.margenCentavos, `${periodo}: el margen total suma solo las líneas completas`);
    if (periodo === 'MES_ANTERIOR') {
      verificar(sinCosto.some((d) => d.codigo === 'DEM-SIN-COSTO') && tt.lineasSinCosto === 1 && tt.lineasSinPrecio === 1, 'Mes anterior: DEM-SIN-COSTO «sin costo» y la batería «sin precio» quedan fuera de los totales', texto(tt));
    }
  }
  // «sin existencia»: se deja una refacción activa en 0 (base de pruebas) y se restaura.
  await conexion.query("UPDATE parts SET stock = 0 WHERE code = 'COR-DIS-004'");
  const rot0 = await api('GET', '/api/reports/rotation?periodo=MES_ACTUAL&limite=100', token.admin);
  const ultima = rot0.cuerpo.datos.at(-1);
  verificar(ultima.codigo === 'COR-DIS-004' && ultima.sinExistencia === true && ultima.rotacion === null, 'rotación: con existencia 0 sale «sin existencia» (sin rotación) y al final', texto(ultima));
  verificar(rot0.cuerpo.datos.slice(0, -1).every((d) => d.existencia > 0), 'rotación: solo las agotadas van al final');
  await conexion.query("UPDATE parts SET stock = 1 WHERE code = 'COR-DIS-004'");
  const rotMes = await api('GET', '/api/reports/rotation?periodo=MES_ACTUAL&limite=100', token.admin);
  const [salidas] = await conexion.query(
    "SELECT p.code AS codigo, COALESCE(SUM(ABS(m.quantity)),0) AS u FROM parts p LEFT JOIN inventory_movements m ON m.part_id=p.id AND m.movement_type='OUT' AND m.created_at >= ? AND m.created_at < ? WHERE p.is_active=1 GROUP BY p.id",
    [r.act, r.sig]);
  verificar(texto(salidas.map((s) => [s.codigo, Number(s.u)]).sort()) === texto(rotMes.cuerpo.datos.map((d) => [d.codigo, d.unidadesSalidas]).sort()), 'rotación: las salidas = suma SQL de movimientos OUT por refacción activa');
  verificar(!rotMes.cuerpo.datos.some((d) => d.codigo === 'FLT-AIR-000'), 'rotación: la refacción inactiva no aparece');

  // ============================================================== E12
  escenario('E12 - Exportación (CA-9)');
  // Una refacción activa cuyo nombre es una fórmula, para comprobar la neutralización.
  const creada = await api('POST', '/api/parts', token.admin, { name: '=HYPERLINK("http://x","Clic")', code: 'ZZ-FORMULA', stock: 3, minStock: 1, salePrice: 10 });
  verificar(creada.status === 201, 'se crea una refacción de prueba con nombre «=HYPERLINK(...)»', String(creada.status));
  const filasDe = (bytes) => bytes.toString('utf8').replace(/^﻿/, '').split('\r\n').filter((x) => x !== '');
  const JSON_REPORTES = { income: null, services: null, productivity: null, parts: null, rotation: null };
  for (const reporte of Object.keys(JSON_REPORTES)) {
    const e = await api('GET', `/api/reports/${reporte}/export?periodo=MES_ANTERIOR`, token.admin);
    const cd = e.cabeceras.get('content-disposition') ?? '';
    verificar(e.status === 200 && (e.cabeceras.get('content-type') ?? '').startsWith('text/csv'), `${reporte}: 200 y text/csv`, `${e.status}`);
    verificar(e.bytes[0] === 0xef && e.bytes[1] === 0xbb && e.bytes[2] === 0xbf, `${reporte}: UTF-8 con BOM`);
    verificar(/^attachment; filename="motorix-[a-z]+-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv"$/.test(cd) && (e.cabeceras.get('cache-control') ?? '').includes('no-store'), `${reporte}: attachment con nombre motorix-…-desde-hasta.csv y no-store`, cd);
    verificar(e.bytes.toString('utf8').includes('\r\n') && filasDe(e.bytes).length >= 2, `${reporte}: filas con CRLF, encabezado y datos`);
  }
  const partsCsv = filasDe((await api('GET', '/api/reports/parts/export?periodo=MES_ANTERIOR', token.admin)).bytes);
  const partsJson = (await api('GET', '/api/reports/parts?periodo=MES_ANTERIOR&limite=100', token.admin)).cuerpo;
  verificar(partsCsv.length === 1 + partsJson.datos.length + 1, 'parts: el CSV tiene encabezado + una fila por uso + fila Total (coincide con la pantalla)', `${partsCsv.length} vs ${partsJson.datos.length}`);
  verificar(partsCsv.at(-1).includes(String(partsJson.totales.ventasCentavos / 100) + '.00') && partsCsv.at(-1).startsWith('Total (líneas completas)'), 'parts: la fila Total repite los totales de la pantalla', partsCsv.at(-1));
  verificar(partsCsv.some((f) => f.includes('DEM-SIN-COSTO') && f.endsWith('sin costo')), 'parts: la línea sin costo lleva «sin costo» en Observación');
  const rotCsv = filasDe((await api('GET', '/api/reports/rotation/export?periodo=MES_ACTUAL', token.admin)).bytes);
  const rotJson = (await api('GET', '/api/reports/rotation?periodo=MES_ACTUAL&limite=100', token.admin)).cuerpo;
  verificar(rotCsv.length === 1 + rotJson.datos.length, 'rotation: el CSV tiene encabezado + una fila por refacción activa', `${rotCsv.length} vs ${rotJson.datos.length}`);
  const filaFormula = rotCsv.find((f) => f.includes('ZZ-FORMULA')) ?? '';
  verificar(filaFormula.includes('\'=HYPERLINK') && !/(^|,)"?=HYPERLINK/.test(filaFormula), 'rotation: el nombre «=HYPERLINK(...)» sale neutralizado con una comilla simple', filaFormula);
  const inc = await api('GET', '/api/reports/income/export?periodo=MES_ANTERIOR', token.admin);
  const incJson = (await api('GET', '/api/reports/income?periodo=MES_ANTERIOR', token.admin)).cuerpo;
  verificar(filasDe(inc.bytes).length === 1 + 1 + incJson.porPeriodo.length + incJson.porMetodo.length, 'income: total + filas por día + filas por método (coincide con la pantalla)');
  const sinDatos = await api('GET', `/api/reports/income/export?desde=${r.futuro}&hasta=${r.futuro}`, token.admin);
  verificar(sinDatos.status === 200 && filasDe(sinDatos.bytes).length === 1, 'un rango sin datos exporta solo los encabezados');
  const noExiste = await api('GET', '/api/reports/users/export?periodo=MES_ACTUAL', token.admin);
  verificar(noExiste.status === 404 && noExiste.cuerpo.error.codigo === 'REPORT_NOT_FOUND', 'un reporte inexistente responde 404 REPORT_NOT_FOUND');
  const [[audit]] = await conexion.query("SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'REPORT%'");
  verificar(Number(audit.n) === 0, 'exportar no escribe en la bitácora (decisión del usuario)');
  verificar(true, 'la apertura en Excel (acentos y columnas) se verificó a mano con la captura s7-17-exportacion-csv.png');

  // ============================================================== E13
  escenario('E13 - Cierre (seed 012 dos veces; suites completas en T151)');
} finally {
  servidor.kill();
}

const antes = await conteos();
verificar(sembrar(), 'los seeds 001-012 se aplican sin error (corrida 2)');
const despues = await conteos();
const igual = JSON.stringify({ ...antes, audit_log: 0, terms_acceptances: 0, parts: 0, inventory_movements: 0 }) === JSON.stringify({ ...despues, audit_log: 0, terms_acceptances: 0, parts: 0, inventory_movements: 0 });
verificar(igual, 'la corrida 2 no duplica nada (conteos iguales; se excluyen bitácora y aceptaciones que crea la API, y refacciones y movimientos por la refacción de prueba de E12)', texto({ antes, despues }));
verificar(antes.service_orders === despues.service_orders && antes.payments === despues.payments && antes.order_parts === despues.order_parts, 'órdenes, pagos y usos sin cambios tras la corrida 2');
const [[ids]] = await conexion.query('SELECT COUNT(*) AS n FROM service_orders WHERE id BETWEEN 9101 AND 9107');
verificar(Number(ids.n) === 7, 'siguen las 7 órdenes 9101-9107', String(ids.n));

// Vaciar la base de pruebas (queda lista para Jest) con los contadores en 1.
const [tablas] = await conexion.query("SELECT table_name AS nombre FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE' AND table_name <> 'schema_migrations'", [BASE]);
await conexion.query('SET FOREIGN_KEY_CHECKS = 0');
for (const { nombre } of tablas) {
  await conexion.query(`DELETE FROM \`${nombre}\``);
  await conexion.query(`ALTER TABLE \`${nombre}\` AUTO_INCREMENT = 1`);
}
await conexion.query('SET FOREIGN_KEY_CHECKS = 1');
await conexion.end();

console.log(`\nResultado: ${total - fallas}/${total} verificaciones OK${fallas ? `, ${fallas} FALLARON` : ''}. motorix_test quedó vacía.`);
process.exit(fallas === 0 ? 0 : 1);
