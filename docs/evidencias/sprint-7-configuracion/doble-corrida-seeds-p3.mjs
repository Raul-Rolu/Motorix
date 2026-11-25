#!/usr/bin/env node
/**
 * Verificación de la doble corrida de los seeds 001–012 (bloque P3 del Sprint 7,
 * 008-configuracion-seguridad-reportes, T143; FR-029, CA-12).
 *
 * Uso (desde la raíz del repositorio):
 *   node docs/evidencias/sprint-7-configuracion/doble-corrida-seeds-p3.mjs [--vaciar]
 *
 * Precondición: `motorix_test` con las migraciones 001–023 aplicadas y VACÍA de
 * datos (las pruebas de Jest la dejan así). Si tiene datos, el script se detiene y
 * pide volver a ejecutarlo con `--vaciar`. SOLO opera sobre `motorix_test` (se niega
 * a correr sobre cualquier otra base) y arranca la API de esa misma base en el
 * puerto 3057. No recrea ninguna base. Pasos:
 *   1) aplica los seeds 001–012 dos veces con el runner del repositorio y compara
 *      los conteos por tabla (sin duplicados);
 *   2) con la cuenta `admin` consulta por la API los cinco reportes de «Mes
 *      anterior» y «Mes actual» y los cuadra contra consultas SQL independientes
 *      sobre toda la base y contra las cifras del seed 012 (órdenes 9101–9107);
 *   3) comprueba que la exportación CSV de cada reporte responde con datos;
 *   4) vuelve a sembrar con la base ya usada (corrida 3) y comprueba que nada cambia;
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
const PUERTO = 3057;
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
const texto = (valor) => JSON.stringify(valor);

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
  const bruto = await respuesta.text();
  let cuerpoJson = null;
  try {
    cuerpoJson = JSON.parse(bruto);
  } catch {
    // no es JSON (por ejemplo, un CSV)
  }
  return { status: respuesta.status, cuerpo: cuerpoJson, texto: bruto };
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
const [[migraciones]] = await conexion.query('SELECT COUNT(*) AS total FROM schema_migrations');
verificar(Number(migraciones.total) === 23, 'motorix_test tiene aplicadas las 23 migraciones', String(migraciones.total));
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
console.log('--- Corrida 1 de seeds 001-012 ---');
verificar(sembrar(), 'los seeds se aplican sin error (corrida 1)');
const uno = await conteos();
console.log(texto(uno));

console.log('--- Corrida 2 de seeds 001-012 ---');
verificar(sembrar(), 'los seeds se aplican sin error (corrida 2)');
const dos = await conteos();
console.log(texto(dos));
verificar(texto(uno) === texto(dos), 'los conteos por tabla son idénticos entre corridas');

// --- Contenido del seed 012 -------------------------------------------------
const [ordenes] = await conexion.query(
  `SELECT o.id, o.status, u.username AS mecanico FROM service_orders o LEFT JOIN users u ON u.id = o.mechanic_id
   WHERE o.id BETWEEN 9101 AND 9107 ORDER BY o.id`
);
verificar(
  texto(ordenes.map((o) => [o.id, o.status, o.mecanico])) ===
    texto([
      [9101, 'ENTREGADO', 'mecanico'],
      [9102, 'ENTREGADO', 'mecanico2'],
      [9103, 'TERMINADO', null],
      [9104, 'ENTREGADO', 'mecanico'],
      [9105, 'TERMINADO', 'mecanico2'],
      [9106, 'ENTREGADO', null],
      [9107, 'CANCELADA', null],
    ]),
  'las órdenes 9101-9107 existen con los estados y mecánicos del seed',
  texto(ordenes)
);
const [[inactivo]] = await conexion.query("SELECT active FROM users WHERE username = 'mecanico2'");
verificar(inactivo?.active === 0, 'mecanico2 existe y está INACTIVO');

// --- Rangos de los meses (en la hora local de MySQL, la misma de los reportes) ---
const [[rangos]] = await conexion.query(
  `SELECT TIMESTAMP(DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)) AS ant_ini,
          TIMESTAMP(DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS act_ini,
          TIMESTAMP(DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH)) AS sig_ini`
);
const MESES = [
  ['MES_ANTERIOR', rangos.ant_ini, rangos.act_ini],
  ['MES_ACTUAL', rangos.act_ini, rangos.sig_ini],
];
const CERRADAS = "o.status IN ('TERMINADO', 'ENTREGADO') AND o.status_changed_at >= ? AND o.status_changed_at < ?";
const centavos = (valor) => Math.round(Number(valor ?? 0) * 100);

// Cifras del seed 012 por mes (órdenes 9101-9107), calculadas a mano en el diseño.
const ESPERADO_SEED = {
  MES_ANTERIOR: { ingresos: 492050, servicios: [5, 318050], mano: [3, 80000], ventas: 129000, costo: 90850, lineas: 5 },
  MES_ACTUAL: { ingresos: 473000, servicios: [5, 277000], mano: [3, 83000], ventas: 200000, costo: 136200, lineas: 5 },
};

// --- Los cinco reportes por la API (cuenta admin) ----------------------------
const servidor = await arrancarApi();
try {
  const login = await api('POST', '/api/auth/login', null, { identificacion: 'admin', contrasena: 'Admin123' });
  const token = login.cuerpo?.token;
  verificar(Boolean(token), 'admin inicia sesión');
  // El seed 011 publicó la versión 1 de los términos: el administrador la acepta primero.
  const vigente = await api('GET', '/api/terms/current', token);
  const aceptar = await api('POST', '/api/terms/accept', token, { termsVersionId: vigente.cuerpo?.vigente?.id });
  verificar(aceptar.status === 200, 'admin acepta la versión vigente de los términos', String(aceptar.status));

  for (const [periodo, desde, hasta] of MESES) {
    console.log(`--- Reportes de ${periodo} ---`);
    const esperado = ESPERADO_SEED[periodo];
    const rango = [desde, hasta];

    // Ingresos.
    const ingresos = await api('GET', `/api/reports/income?periodo=${periodo}`, token);
    const [[sqlIngresos]] = await conexion.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'COMPLETED' AND created_at >= ? AND created_at < ?",
      rango
    );
    verificar(ingresos.status === 200 && ingresos.cuerpo?.totalCentavos === centavos(sqlIngresos.total), `${periodo}: ingresos de la API = suma SQL de pagos COMPLETED`, `${ingresos.cuerpo?.totalCentavos} vs ${centavos(sqlIngresos.total)}`);
    const sumaMetodos = ingresos.cuerpo?.porMetodo?.reduce((s, m) => s + m.totalCentavos, 0);
    const sumaPeriodos = ingresos.cuerpo?.porPeriodo?.reduce((s, m) => s + m.totalCentavos, 0);
    verificar(sumaMetodos === ingresos.cuerpo?.totalCentavos && sumaPeriodos === ingresos.cuerpo?.totalCentavos, `${periodo}: el desglose por método y por periodo suma el total`, `${sumaMetodos}/${sumaPeriodos}`);
    const [[seedIngresos]] = await conexion.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'COMPLETED' AND order_id BETWEEN 9101 AND 9107 AND created_at >= ? AND created_at < ?",
      rango
    );
    verificar(centavos(seedIngresos.total) === esperado.ingresos, `${periodo}: los pagos del seed 012 suman ${esperado.ingresos / 100}`, String(centavos(seedIngresos.total)));

    // Servicios.
    const servicios = await api('GET', `/api/reports/services?periodo=${periodo}`, token);
    const [[sqlServicios]] = await conexion.query(
      `SELECT COUNT(*) AS lineas, COALESCE(SUM(s.amount), 0) AS total FROM service_orders o JOIN order_services s ON s.order_id = o.id WHERE ${CERRADAS}`,
      rango
    );
    const lineasApi = servicios.cuerpo?.datos?.reduce((s, d) => s + d.cantidad, 0);
    const importeApi = servicios.cuerpo?.datos?.reduce((s, d) => s + d.importeCentavos, 0);
    verificar(lineasApi === Number(sqlServicios.lineas) && importeApi === centavos(sqlServicios.total), `${periodo}: servicios de la API = líneas e importe SQL de órdenes cerradas`, `${lineasApi}/${importeApi} vs ${sqlServicios.lineas}/${centavos(sqlServicios.total)}`);
    const [[seedServicios]] = await conexion.query(
      `SELECT COUNT(*) AS lineas, COALESCE(SUM(s.amount), 0) AS total FROM service_orders o JOIN order_services s ON s.order_id = o.id WHERE o.id BETWEEN 9101 AND 9107 AND ${CERRADAS}`,
      rango
    );
    verificar(texto([Number(seedServicios.lineas), centavos(seedServicios.total)]) === texto(esperado.servicios), `${periodo}: los servicios del seed 012 son ${esperado.servicios[0]} líneas por ${esperado.servicios[1] / 100}`, texto([seedServicios.lineas, centavos(seedServicios.total)]));
    verificar(servicios.cuerpo?.datos?.some((d) => d.tipo === 'Sin tipo') && servicios.cuerpo?.datos?.some((d) => d.tipo === 'Cambio de aceite'), `${periodo}: aparecen servicios con tipo y «Sin tipo»`);

    // Productividad.
    const productividad = await api('GET', `/api/reports/productivity?periodo=${periodo}`, token);
    const [[sqlProd]] = await conexion.query(
      `SELECT COUNT(*) AS ordenes, COALESCE(SUM((SELECT COALESCE(SUM(l.amount), 0) FROM order_labor l WHERE l.order_id = o.id)), 0) AS mano FROM service_orders o WHERE ${CERRADAS}`,
      rango
    );
    const ordenesApi = productividad.cuerpo?.datos?.reduce((s, d) => s + d.ordenes, 0);
    const manoApi = productividad.cuerpo?.datos?.reduce((s, d) => s + d.manoObraCentavos, 0);
    verificar(ordenesApi === Number(sqlProd.ordenes) && manoApi === centavos(sqlProd.mano), `${periodo}: productividad de la API = órdenes y mano de obra SQL`, `${ordenesApi}/${manoApi} vs ${sqlProd.ordenes}/${centavos(sqlProd.mano)}`);
    const [[seedProd]] = await conexion.query(
      `SELECT COUNT(*) AS ordenes, COALESCE(SUM((SELECT COALESCE(SUM(l.amount), 0) FROM order_labor l WHERE l.order_id = o.id)), 0) AS mano FROM service_orders o WHERE o.id BETWEEN 9101 AND 9107 AND ${CERRADAS}`,
      rango
    );
    verificar(texto([Number(seedProd.ordenes), centavos(seedProd.mano)]) === texto(esperado.mano), `${periodo}: el seed 012 aporta ${esperado.mano[0]} órdenes y ${esperado.mano[1] / 100} de mano de obra`, texto([seedProd.ordenes, centavos(seedProd.mano)]));
    verificar(productividad.cuerpo?.datos?.some((d) => d.mecanico === null), `${periodo}: aparece «Sin asignar»`);
    verificar(
      productividad.cuerpo?.datos?.filter((d) => d.mecanico !== null).length >= 2,
      `${periodo}: aparecen al menos dos mecánicos`
    );

    // Refacciones.
    const refacciones = await api('GET', `/api/reports/parts?periodo=${periodo}&limite=100`, token);
    const [[sqlPartes]] = await conexion.query(
      `SELECT COUNT(*) AS lineas,
              COALESCE(SUM(CASE WHEN op.unit_price IS NOT NULL AND p.purchase_price IS NOT NULL THEN op.unit_price * op.quantity END), 0) AS ventas,
              COALESCE(SUM(CASE WHEN op.unit_price IS NOT NULL AND p.purchase_price IS NOT NULL THEN p.purchase_price * op.quantity END), 0) AS costo
       FROM service_orders o JOIN order_parts op ON op.order_id = o.id JOIN parts p ON p.id = op.part_id WHERE ${CERRADAS}`,
      rango
    );
    const totales = refacciones.cuerpo?.totales;
    verificar(
      refacciones.cuerpo?.total === Number(sqlPartes.lineas) && totales?.ventasCentavos === centavos(sqlPartes.ventas) && totales?.costoCentavos === centavos(sqlPartes.costo) && totales?.margenCentavos === totales?.ventasCentavos - totales?.costoCentavos,
      `${periodo}: refacciones de la API = líneas, ventas y costo SQL (margen = ventas − costo)`,
      texto({ api: [refacciones.cuerpo?.total, totales], sql: sqlPartes })
    );
    const [[seedPartes]] = await conexion.query(
      `SELECT COUNT(*) AS lineas,
              COALESCE(SUM(CASE WHEN op.unit_price IS NOT NULL AND p.purchase_price IS NOT NULL THEN op.unit_price * op.quantity END), 0) AS ventas,
              COALESCE(SUM(CASE WHEN op.unit_price IS NOT NULL AND p.purchase_price IS NOT NULL THEN p.purchase_price * op.quantity END), 0) AS costo
       FROM service_orders o JOIN order_parts op ON op.order_id = o.id JOIN parts p ON p.id = op.part_id WHERE o.id BETWEEN 9101 AND 9107 AND ${CERRADAS}`,
      rango
    );
    verificar(
      Number(seedPartes.lineas) === esperado.lineas && centavos(seedPartes.ventas) === esperado.ventas && centavos(seedPartes.costo) === esperado.costo,
      `${periodo}: el seed 012 aporta ${esperado.lineas} usos, ventas ${esperado.ventas / 100} y costo ${esperado.costo / 100}`,
      texto([seedPartes.lineas, centavos(seedPartes.ventas), centavos(seedPartes.costo)])
    );
    if (periodo === 'MES_ANTERIOR') {
      verificar(totales?.lineasSinCosto === 1 && totales?.lineasSinPrecio === 1, `${periodo}: una línea sin costo y una sin precio fuera de los totales`, texto(totales));
    }

    // Rotación.
    const rotacion = await api('GET', `/api/reports/rotation?periodo=${periodo}&limite=100`, token);
    const [salidas] = await conexion.query(
      `SELECT p.code AS codigo, COALESCE(SUM(ABS(m.quantity)), 0) AS unidades
       FROM parts p LEFT JOIN inventory_movements m ON m.part_id = p.id AND m.movement_type = 'OUT' AND m.created_at >= ? AND m.created_at < ?
       WHERE p.is_active = 1 GROUP BY p.id`,
      rango
    );
    const sqlUnidades = Object.fromEntries(salidas.map((s) => [s.codigo, Number(s.unidades)]));
    const apiUnidades = Object.fromEntries((rotacion.cuerpo?.datos ?? []).map((d) => [d.codigo, d.unidadesSalidas]));
    verificar(texto(Object.entries(sqlUnidades).sort()) === texto(Object.entries(apiUnidades).sort()), `${periodo}: salidas de rotación de la API = suma SQL de movimientos OUT por refacción`, texto({ apiUnidades, sqlUnidades }));
    verificar(rotacion.cuerpo?.datos?.some((d) => d.unidadesSalidas > 0), `${periodo}: la rotación tiene refacciones con salidas`);

    // Exportación CSV.
    for (const reporte of ['income', 'services', 'productivity', 'parts', 'rotation']) {
      const csv = await api('GET', `/api/reports/${reporte}/export?periodo=${periodo}`, token);
      verificar(csv.status === 200 && csv.texto.split('\r\n').filter(Boolean).length >= 2, `${periodo}: la exportación CSV de ${reporte} trae encabezado y datos`, `${csv.status}`);
    }
  }
} finally {
  servidor.kill();
}

// --- Corrida 3 con la base ya usada -----------------------------------------
// El uso de la API (inicio de sesión y aceptación de términos) agrega filas a la bitácora y a
// las aceptaciones: la corrida 3 se compara contra el estado justo anterior a ella.
console.log('--- Corrida 3 de seeds 001-012 (base ya usada) ---');
const antesDeTres = await conteos();
verificar(sembrar(), 'los seeds se aplican sin error (corrida 3)');
const despuesDeTres = await conteos();
verificar(texto(antesDeTres) === texto(despuesDeTres), 'la corrida 3 no cambia ningún conteo (nada se duplica ni se repone)', texto({ antesDeTres, despuesDeTres }));
verificar(
  texto({ ...antesDeTres, audit_log: 0, terms_acceptances: 0 }) === texto({ ...dos, audit_log: 0, terms_acceptances: 0 }),
  'fuera de la bitácora y de las aceptaciones (que crea el uso de la API), los conteos son los de las corridas 1 y 2'
);

await vaciar();
const final = await conteos();
verificar(
  Object.entries(final).every(([tabla, total]) => tabla === 'schema_migrations' || total === 0),
  'motorix_test quedó vacía otra vez'
);
await conexion.end();

console.log(fallas === 0 ? 'Resultado: TODO OK' : `Resultado: ${fallas} verificación(es) fallaron`);
process.exit(fallas === 0 ? 0 : 1);
