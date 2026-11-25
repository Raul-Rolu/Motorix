// 008-configuracion-seguridad-reportes, T133 (bloque P3, US10; FR-028, CA-11):
// rendimiento de los cinco reportes con un volumen ampliado, contra `motorix_test`.
// Siembra por SQL masivo 1,000 órdenes cerradas dentro del rango (más 500 fuera de
// él, para que los índices tengan algo que descartar), 3,000 usos de refacciones,
// 500 refacciones, 5,000 movimientos y 2,000 pagos (y líneas de servicio y de mano
// de obra para los reportes de servicios y productividad). Descarta un
// calentamiento, mide 5 llamadas por reporte con `performance.now()` y exige que
// la peor sea MENOR de 2,000 ms y que cada petición emita 6 consultas SQL o
// menos (contando la de autenticación).
//
// Si se define `REPORTES_RENDIMIENTO_SALIDA`, escribe ahí el resumen de la medición
// (para `docs/evidencias/sprint-7-configuracion/reports-performance.txt`).
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { jest } from '@jest/globals';
import { crearApp } from '../../app.js';
import {
  prepararBaseDePruebas,
  limpiarTablas,
  cerrarBaseDePruebas,
} from '../helpers/db-test.js';
import { getPool } from '../../config/db.js';

jest.setTimeout(180000);

const app = crearApp();

beforeAll(async () => {
  await prepararBaseDePruebas();
  process.env.JWT_SECRET ??= 'secreto-de-pruebas';
});

afterEach(async () => {
  jest.restoreAllMocks();
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

const LIMITE_MS = 2000;
const LIMITE_CONSULTAS = 6;
const LLAMADAS = 5;
const RANGO = 'desde=2026-11-01&hasta=2026-11-30';
const RANGO_MAXIMO = 'desde=2026-01-01&hasta=2026-12-31';

const VOLUMEN = { ordenesEnRango: 1000, ordenesFuera: 500, usos: 3000, refacciones: 500, movimientos: 5000, pagos: 2000, servicios: 2000, manoDeObra: 1500 };

/** Generador pseudoaleatorio determinista (las mediciones son repetibles). */
function generador(semilla) {
  let estado = semilla;
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296;
    return estado / 4294967296;
  };
}

async function insertarPorLotes(sql, filas, lote = 1000) {
  for (let i = 0; i < filas.length; i += lote) {
    await getPool().query(sql, [filas.slice(i, i + lote)]);
  }
}

const fecha = (aleatorio, mes) => {
  const dia = 1 + Math.floor(aleatorio() * 28);
  const hora = Math.floor(aleatorio() * 24);
  return `2026-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')} ${String(hora).padStart(2, '0')}:30:00`;
};

async function sembrarVolumen() {
  const aleatorio = generador(20261124);
  const hash = await bcrypt.hash('Usuario123', 4);

  const [admin] = await getPool().query(
    "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('admin', 'admin@motorix.local', ?, 'Administrador', 'ADMIN')",
    [hash]
  );
  const mecanicos = [];
  for (let i = 1; i <= 3; i += 1) {
    const [m] = await getPool().query(
      "INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, 'MECHANIC')",
      [`mec${i}`, `mec${i}@motorix.local`, hash, `Mecánico ${i}`]
    );
    mecanicos.push(m.insertId);
  }
  const [cliente] = await getPool().query("INSERT INTO clients (full_name, phone) VALUES ('Cliente Volumen', '5550001111')");
  const [vehiculo] = await getPool().query(
    "INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, 'VOL-001-A', 'Nissan', 'Versa', 2020)",
    [cliente.insertId]
  );
  const tipos = [];
  for (const nombre of ['Cambio de aceite', 'Afinación', 'Frenos', 'Neumáticos']) {
    const [t] = await getPool().query('INSERT INTO service_types (name, interval_days) VALUES (?, 180)', [nombre]);
    tipos.push(t.insertId);
  }

  // Refacciones: 10 % sin existencia, 10 % inactivas, 15 % sin precio de compra.
  const partes = Array.from({ length: VOLUMEN.refacciones }, (_, i) => [
    `Refacción ${i}`,
    `VOL-${String(i).padStart(4, '0')}`,
    i % 10 === 0 ? 0 : 1 + Math.floor(aleatorio() * 40),
    0,
    i % 10 === 5 ? 0 : 1,
    i % 7 === 0 ? null : Math.round(aleatorio() * 50000) / 100,
    Math.round(aleatorio() * 90000) / 100 + 10,
  ]);
  await insertarPorLotes('INSERT INTO parts (name, code, stock, min_stock, is_active, purchase_price, sale_price) VALUES ?', partes);
  const [filasPartes] = await getPool().query('SELECT id FROM parts ORDER BY id');
  const idsPartes = filasPartes.map((f) => f.id);

  // Órdenes: 1,000 cerradas en noviembre y 500 en octubre (fuera del rango).
  const estados = ['TERMINADO', 'ENTREGADO'];
  const ordenes = [];
  for (let i = 0; i < VOLUMEN.ordenesEnRango + VOLUMEN.ordenesFuera; i += 1) {
    const enRango = i < VOLUMEN.ordenesEnRango;
    ordenes.push([
      cliente.insertId,
      vehiculo.insertId,
      i % 4 === 0 ? null : mecanicos[i % 3],
      estados[i % 2],
      30000 + i,
      'Servicio de volumen',
      fecha(aleatorio, enRango ? 11 : 10),
    ]);
  }
  await insertarPorLotes(
    'INSERT INTO service_orders (client_id, vehicle_id, mechanic_id, status, mileage_entry, reason, status_changed_at) VALUES ?',
    ordenes
  );
  const [filasOrdenes] = await getPool().query('SELECT id FROM service_orders ORDER BY id');
  const idsOrdenes = filasOrdenes.map((f) => f.id);
  const unaOrden = () => idsOrdenes[Math.floor(aleatorio() * idsOrdenes.length)];

  await insertarPorLotes(
    'INSERT INTO order_services (order_id, description, amount, service_type_id) VALUES ?',
    Array.from({ length: VOLUMEN.servicios }, (_, i) => [
      unaOrden(),
      'Servicio',
      Math.round(aleatorio() * 150000) / 100,
      i % 5 === 0 ? null : tipos[i % tipos.length],
    ])
  );
  await insertarPorLotes(
    'INSERT INTO order_labor (order_id, description, amount) VALUES ?',
    Array.from({ length: VOLUMEN.manoDeObra }, () => [unaOrden(), 'Mano de obra', Math.round(aleatorio() * 80000) / 100])
  );
  await insertarPorLotes(
    'INSERT INTO order_parts (order_id, part_id, quantity, unit_price) VALUES ?',
    Array.from({ length: VOLUMEN.usos }, (_, i) => [
      unaOrden(),
      idsPartes[Math.floor(aleatorio() * idsPartes.length)],
      1 + Math.floor(aleatorio() * 4),
      i % 9 === 0 ? null : Math.round(aleatorio() * 90000) / 100 + 10,
    ])
  );
  await insertarPorLotes(
    'INSERT INTO inventory_movements (part_id, movement_type, quantity, reason, created_at) VALUES ?',
    Array.from({ length: VOLUMEN.movimientos }, (_, i) => [
      idsPartes[Math.floor(aleatorio() * idsPartes.length)],
      i % 5 === 0 ? 'IN' : 'OUT',
      1 + Math.floor(aleatorio() * 6),
      'Movimiento de volumen',
      fecha(aleatorio, i % 3 === 0 ? 10 : 11),
    ])
  );
  await insertarPorLotes(
    'INSERT INTO payments (order_id, method, amount, status, created_at) VALUES ?',
    Array.from({ length: VOLUMEN.pagos }, (_, i) => [
      unaOrden(),
      ['CASH', 'CARD', 'TRANSFER', 'MERCADO_PAGO'][i % 4],
      Math.round(aleatorio() * 300000) / 100 + 1,
      i % 10 === 0 ? 'PENDING' : 'COMPLETED',
      fecha(aleatorio, i % 4 === 0 ? 10 : 11),
    ])
  );

  const login = await request(app).post('/api/auth/login').send({ identificacion: 'admin', contrasena: 'Usuario123' });
  return { token: login.body.token, idAdmin: admin.insertId };
}

/** Una llamada: milisegundos y consultas SQL emitidas por la petición. */
async function medir(token, reporte, rango) {
  const pool = getPool();
  const consultas = [];
  const original = pool.query.bind(pool);
  const espia = jest.spyOn(pool, 'query').mockImplementation((sql, ...resto) => {
    consultas.push(typeof sql === 'string' ? sql : (sql?.sql ?? ''));
    return original(sql, ...resto);
  });
  const inicio = performance.now();
  const respuesta = await request(app).get(`/api/reports/${reporte}?${rango}`).set('Authorization', `Bearer ${token}`);
  const ms = performance.now() - inicio;
  espia.mockRestore();
  return { ms, consultas: consultas.length, status: respuesta.status, cuerpo: respuesta.body };
}

const REPORTES = ['income', 'services', 'productivity', 'parts', 'rotation'];

test('cada reporte responde en menos de 2 s y con 6 consultas SQL o menos (volumen ampliado)', async () => {
  const { token } = await sembrarVolumen();

  const [[conteos]] = await getPool().query(
    `SELECT (SELECT COUNT(*) FROM service_orders) AS ordenes, (SELECT COUNT(*) FROM order_parts) AS usos,
            (SELECT COUNT(*) FROM parts) AS partes, (SELECT COUNT(*) FROM inventory_movements) AS movimientos,
            (SELECT COUNT(*) FROM payments) AS pagos, (SELECT COUNT(*) FROM order_services) AS servicios,
            (SELECT COUNT(*) FROM order_labor) AS mano_de_obra`
  );
  expect(Number(conteos.ordenes)).toBe(VOLUMEN.ordenesEnRango + VOLUMEN.ordenesFuera);
  expect(Number(conteos.usos)).toBe(VOLUMEN.usos);
  expect(Number(conteos.partes)).toBe(VOLUMEN.refacciones);
  expect(Number(conteos.movimientos)).toBe(VOLUMEN.movimientos);
  expect(Number(conteos.pagos)).toBe(VOLUMEN.pagos);

  const resumen = [];
  for (const [etiqueta, rango] of [
    ['mes (30 días)', RANGO],
    ['año (366 días)', RANGO_MAXIMO],
  ]) {
    for (const reporte of REPORTES) {
      await medir(token, reporte, rango); // calentamiento (se descarta)
      const tiempos = [];
      let consultas = 0;
      for (let i = 0; i < LLAMADAS; i += 1) {
        const llamada = await medir(token, reporte, rango);
        expect(llamada.status).toBe(200);
        tiempos.push(llamada.ms);
        consultas = Math.max(consultas, llamada.consultas);
      }
      const maximo = Math.max(...tiempos);
      const promedio = tiempos.reduce((a, b) => a + b, 0) / tiempos.length;
      resumen.push({ rango: etiqueta, reporte, maximo, promedio, consultas, tiempos });
      expect(maximo).toBeLessThan(LIMITE_MS);
      expect(consultas).toBeLessThanOrEqual(LIMITE_CONSULTAS);
    }
  }

  // Los reportes devuelven datos reales (la medición no es sobre resultados vacíos).
  const ingresos = await medir(token, 'income', RANGO);
  const refacciones = await medir(token, 'parts', RANGO);
  const rotacion = await medir(token, 'rotation', RANGO);
  expect(ingresos.cuerpo.totalCentavos).toBeGreaterThan(0);
  expect(refacciones.cuerpo.total).toBeGreaterThan(0);
  expect(rotacion.cuerpo.total).toBeGreaterThan(0);

  const lineas = [
    'T133/T134 - Rendimiento de los reportes del Sprint 7 (bloque P3) en motorix_test',
    `Volumen: ${conteos.ordenes} órdenes cerradas (${VOLUMEN.ordenesEnRango} en el rango y ${VOLUMEN.ordenesFuera} fuera), ${conteos.usos} usos de refacciones, ${conteos.partes} refacciones, ${conteos.movimientos} movimientos, ${conteos.pagos} pagos, ${conteos.servicios} líneas de servicio y ${conteos.mano_de_obra} de mano de obra.`,
    `Método: 1 llamada de calentamiento descartada y ${LLAMADAS} medidas por reporte con performance.now() (petición HTTP completa con autenticación). Límites: máximo < ${LIMITE_MS} ms y <= ${LIMITE_CONSULTAS} consultas SQL por petición.`,
    '',
    'rango\treporte\tmáximo (ms)\tpromedio (ms)\tconsultas SQL',
    ...resumen.map((r) => `${r.rango}\t${r.reporte}\t${r.maximo.toFixed(1)}\t${r.promedio.toFixed(1)}\t${r.consultas}`),
    '',
    `Peor tiempo: ${Math.max(...resumen.map((r) => r.maximo)).toFixed(1)} ms (límite ${LIMITE_MS} ms). Máximo de consultas: ${Math.max(...resumen.map((r) => r.consultas))} (límite ${LIMITE_CONSULTAS}).`,
  ];
  process.stdout.write(`\n${lineas.join('\n')}\n`);
  if (process.env.REPORTES_RENDIMIENTO_SALIDA) {
    writeFileSync(process.env.REPORTES_RENDIMIENTO_SALIDA, `${lineas.join('\n')}\n`, 'utf8');
  }
});
