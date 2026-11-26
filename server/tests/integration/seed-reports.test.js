// 008-configuracion-seguridad-reportes, T142 (bloque P3; FR-029, CA-12): el seed
// `012_demo_reports.sql` siembra siete órdenes de ejemplo (ids 9101–9107) para que
// los cinco reportes tengan datos al arrancar: cuatro cerradas en el mes anterior
// (tres) y el actual (tres), una cancelada, con mecánicos distintos y sin asignar,
// líneas con y sin tipo, mano de obra, pagos en ambos meses con métodos distintos,
// usos de refacciones con y sin precio de venta y de compra, y movimientos de
// inventario. Es idempotente y omite TODO lo de una orden si su id ya existe.
// Corre contra `motorix_test` con los seeds 001, 002, 004, 005, 008 y 010 como base
// (la orden 9001 del seed 010 se retira para no mezclar sus cifras).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { crearApp } from '../../app.js';
import { prepararBaseDePruebas, limpiarTablas, cerrarBaseDePruebas } from '../helpers/db-test.js';
import { getPool } from '../../config/db.js';

const app = crearApp();
const semillas = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'database', 'seeds');

beforeAll(async () => {
  await prepararBaseDePruebas();
  process.env.JWT_SECRET ??= 'secreto-de-pruebas';
});

afterEach(async () => {
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

async function sembrar(archivo) {
  await getPool().query(readFileSync(path.join(semillas, archivo), 'utf8'));
}

/** Seeds previos que necesita el 012 (cuentas, clientes, órdenes base, refacciones y tipos de servicio). */
async function sembrarBase() {
  // El seed 004 usa los ids 1–4 de vehículos: con la tabla vacía se reinicia su contador.
  await getPool().query('ALTER TABLE vehicles AUTO_INCREMENT = 1');
  for (const archivo of [
    '001_initial_accounts.sql',
    '002_demo_clients_vehicles.sql',
    '004_demo_service_orders.sql',
    '005_demo_parts.sql',
    '008_demo_part_prices.sql',
    '010_demo_settings_service_types.sql',
  ]) {
    await sembrar(archivo);
  }
  // La orden 9001 del seed 010 cae en el mes actual: se retira para aislar las cifras del 012.
  const pool = getPool();
  // Las órdenes 1–5 del seed 004 (la 4 está entregada hace 30 días) también se excluyen de los reportes.
  await pool.query("UPDATE service_orders SET status = 'CANCELADA' WHERE id <= 5");
  await pool.query('DELETE FROM tickets WHERE order_id = 9001');
  await pool.query('DELETE FROM payments WHERE order_id = 9001');
  await pool.query('DELETE FROM order_labor WHERE order_id = 9001');
  await pool.query('DELETE FROM order_services WHERE order_id = 9001');
  await pool.query('DELETE FROM service_orders WHERE id = 9001');
}

const sembrarReportes = () => sembrar('012_demo_reports.sql');

async function contar(tabla, condicion = '1 = 1') {
  const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total FROM ${tabla} WHERE ${condicion}`);
  return Number(total);
}

const TABLAS = ['users', 'parts', 'service_orders', 'order_services', 'order_labor', 'order_parts', 'payments', 'inventory_movements'];

async function conteos() {
  const resultado = {};
  for (const tabla of TABLAS) resultado[tabla] = await contar(tabla);
  return resultado;
}

async function tokenAdmin() {
  const r = await request(app).post('/api/auth/login').send({ identificacion: 'admin', contrasena: 'Admin123' });
  return r.body.token;
}

const consultar = async (reporte, periodo) => {
  const token = await tokenAdmin();
  const r = await request(app).get(`/api/reports/${reporte}?periodo=${periodo}&limite=100`).set({ Authorization: `Bearer ${token}` });
  expect(r.status).toBe(200);
  return r.body;
};

const IDS = [9101, 9102, 9103, 9104, 9105, 9106, 9107];

describe('contenido sembrado', () => {
  test('siembra las siete órdenes 9101–9107 con sus estados y mecánicos', async () => {
    await sembrarBase();
    await sembrarReportes();

    const [filas] = await getPool().query(
      `SELECT o.id, o.status, u.username AS mecanico FROM service_orders o LEFT JOIN users u ON u.id = o.mechanic_id
       WHERE o.id >= 9101 ORDER BY o.id`
    );
    expect(filas.map((f) => [f.id, f.status, f.mecanico])).toEqual([
      [9101, 'ENTREGADO', 'mecanico'],
      [9102, 'ENTREGADO', 'mecanico2'],
      [9103, 'TERMINADO', null],
      [9104, 'ENTREGADO', 'mecanico'],
      [9105, 'TERMINADO', 'mecanico2'],
      [9106, 'ENTREGADO', null],
      [9107, 'CANCELADA', null],
    ]);
  });

  test('las fechas caen en el mes anterior (9101–9103) y en el actual (9104–9107), sin futuro', async () => {
    await sembrarBase();
    await sembrarReportes();

    const [filas] = await getPool().query(
      `SELECT id,
              DATE_FORMAT(status_changed_at, '%Y-%m') AS mes,
              status_changed_at <= NOW() AS no_futuro,
              created_at <= status_changed_at AS creada_antes
       FROM service_orders WHERE id >= 9101 ORDER BY id`
    );
    // El mes anterior se calcula desde el primer día del actual (evita el desborde del día 31).
    const [[{ actual, anteriorExacto }]] = await getPool().query(
      `SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS actual,
              DATE_FORMAT(DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH), '%Y-%m') AS anteriorExacto`
    );
    for (const fila of filas) {
      expect(fila.mes).toBe(fila.id <= 9103 ? anteriorExacto : actual);
      expect(Number(fila.no_futuro)).toBe(1);
      expect(Number(fila.creada_antes)).toBe(1);
    }
    const [[{ pagosFuturos }]] = await getPool().query('SELECT COUNT(*) AS pagosFuturos FROM payments WHERE created_at > NOW()');
    expect(Number(pagosFuturos)).toBe(0);
  });

  test('crea un segundo mecánico INACTIVO sin contraseña utilizable', async () => {
    await sembrarBase();
    await sembrarReportes();

    const [[fila]] = await getPool().query("SELECT role, active, password_hash FROM users WHERE username = 'mecanico2'");
    expect(fila.role).toBe('MECHANIC');
    expect(fila.active).toBe(0);
    expect(fila.password_hash).not.toMatch(/^\$2[aby]\$/);
    const r = await request(app).post('/api/auth/login').send({ identificacion: 'mecanico2', contrasena: 'Mecanico123' });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.token).toBeUndefined();
  });

  test('conteos: 7 órdenes, 11 servicios, 6 manos de obra, 10 usos, 9 pagos y 20 movimientos', async () => {
    await sembrarBase();
    const antes = await conteos();
    await sembrarReportes();
    const despues = await conteos();

    expect(despues.service_orders - antes.service_orders).toBe(7);
    expect(despues.order_services - antes.order_services).toBe(11);
    expect(despues.order_labor - antes.order_labor).toBe(6);
    expect(despues.order_parts - antes.order_parts).toBe(10);
    expect(despues.payments - antes.payments).toBe(9);
    expect(despues.inventory_movements - antes.inventory_movements).toBe(20);
    expect(despues.users - antes.users).toBe(1);
    expect(despues.parts - antes.parts).toBe(1);
  });

  test('la existencia de las refacciones existentes no cambia y todas siguen cuadrando con sus movimientos (SC-004)', async () => {
    await sembrarBase();
    const [antes] = await getPool().query('SELECT id, stock FROM parts WHERE id <= 7 ORDER BY id');
    await sembrarReportes();
    const [despues] = await getPool().query('SELECT id, stock FROM parts WHERE id <= 7 ORDER BY id');
    expect(despues).toEqual(antes);

    const [partes] = await getPool().query(
      `SELECT p.code, p.stock,
              COALESCE(SUM(CASE m.movement_type WHEN 'IN' THEN m.quantity WHEN 'OUT' THEN -m.quantity ELSE m.quantity END), 0) AS acumulado
       FROM parts p LEFT JOIN inventory_movements m ON m.part_id = p.id GROUP BY p.id`
    );
    for (const parte of partes) {
      expect([parte.code, Number(parte.acumulado)]).toEqual([parte.code, parte.stock]);
    }
  });

  test('la refacción nueva no tiene precio de compra pero sí de venta (no crea pendientes de precio)', async () => {
    await sembrarBase();
    await sembrarReportes();

    const [[parte]] = await getPool().query("SELECT sale_price, purchase_price, is_active, stock FROM parts WHERE code = 'DEM-SIN-COSTO'");
    expect(parte.purchase_price).toBeNull();
    expect(Number(parte.sale_price)).toBe(95);
    expect(parte.is_active).toBe(1);
    expect(parte.stock).toBe(3);
    expect(await contar('parts', 'is_active = 1 AND sale_price IS NULL')).toBe(1);
  });
});

describe('cifras de los cinco reportes (ADMIN, por la API)', () => {
  test('ingresos del mes anterior: solo pagos COMPLETED, por método', async () => {
    await sembrarBase();
    await sembrarReportes();

    const r = await consultar('income', 'MES_ANTERIOR');
    expect(r.totalCentavos).toBe(492050);
    const porMetodo = Object.fromEntries(r.porMetodo.map((m) => [m.metodo, m.totalCentavos]));
    expect(porMetodo).toEqual({ CASH: 200000, TRANSFER: 104050, CARD: 148000, MERCADO_PAGO: 40000 });
  });

  test('ingresos del mes actual', async () => {
    await sembrarBase();
    await sembrarReportes();

    const r = await consultar('income', 'MES_ACTUAL');
    expect(r.totalCentavos).toBe(473000);
    const porMetodo = Object.fromEntries(r.porMetodo.map((m) => [m.metodo, m.totalCentavos]));
    expect(porMetodo).toEqual({ CASH: 199000, CARD: 154000, TRANSFER: 120000 });
  });

  test('servicios del mes anterior y del actual (con y sin tipo)', async () => {
    await sembrarBase();
    await sembrarReportes();

    const anterior = await consultar('services', 'MES_ANTERIOR');
    expect(anterior.datos.map((d) => [d.tipo, d.cantidad, d.importeCentavos])).toEqual([
      ['Cambio de aceite', 2, 120000],
      ['Afinación', 1, 120050],
      ['Revisión de frenos', 1, 48000],
      ['Sin tipo', 1, 30000],
    ]);
    const actual = await consultar('services', 'MES_ACTUAL');
    expect(actual.datos.map((d) => [d.tipo, d.cantidad, d.importeCentavos])).toEqual([
      ['Cambio de aceite', 2, 130000],
      ['Afinación', 1, 95000],
      ['Rotación de neumáticos', 1, 30000],
      ['Sin tipo', 1, 22000],
    ]);
  });

  test('productividad: dos mecánicos y «Sin asignar», sin contar la orden cancelada', async () => {
    await sembrarBase();
    await sembrarReportes();

    const resumen = (r) =>
      Object.fromEntries(r.datos.map((d) => [d.mecanico === null ? 'Sin asignar' : d.mecanico.nombre, [d.ordenes, d.manoObraCentavos]]));
    expect(resumen(await consultar('productivity', 'MES_ANTERIOR'))).toEqual({
      'Mecánico del Taller': [1, 35000],
      'Mecánico de Apoyo (ejemplo)': [1, 25000],
      'Sin asignar': [1, 20000],
    });
    expect(resumen(await consultar('productivity', 'MES_ACTUAL'))).toEqual({
      'Mecánico del Taller': [1, 28000],
      'Mecánico de Apoyo (ejemplo)': [1, 40000],
      'Sin asignar': [1, 15000],
    });
  });

  test('refacciones del mes anterior: una línea sin costo y una sin precio quedan fuera de los totales', async () => {
    await sembrarBase();
    await sembrarReportes();

    const r = await consultar('parts', 'MES_ANTERIOR');
    expect(r.total).toBe(5);
    expect(r.totales).toEqual({
      ventasCentavos: 129000,
      costoCentavos: 90850,
      margenCentavos: 38150,
      lineasSinCosto: 1,
      lineasSinPrecio: 1,
    });
    const sinCosto = r.datos.find((d) => d.codigo === 'DEM-SIN-COSTO');
    expect(sinCosto).toMatchObject({ cantidad: 2, ventasCentavos: 19000, costoCentavos: null, margenCentavos: null, sinCosto: true });
    const sinPrecio = r.datos.find((d) => d.codigo === 'BAT-12V-60');
    expect(sinPrecio).toMatchObject({ ventasCentavos: null, costoCentavos: 62000, margenCentavos: null, sinPrecio: true });
  });

  test('refacciones del mes actual: todas las líneas completas y con inactiva incluida', async () => {
    await sembrarBase();
    await sembrarReportes();

    const r = await consultar('parts', 'MES_ACTUAL');
    expect(r.total).toBe(5);
    expect(r.totales).toEqual({
      ventasCentavos: 200000,
      costoCentavos: 136200,
      margenCentavos: 63800,
      lineasSinCosto: 0,
      lineasSinPrecio: 0,
    });
    expect(r.datos.map((d) => d.codigo)).toContain('FLT-AIR-000');
  });

  test('rotación del mes anterior: la refacción nueva y la sin precio de venta salen primero', async () => {
    await sembrarBase();
    await sembrarReportes();

    const r = await consultar('rotation', 'MES_ANTERIOR');
    expect(r.total).toBe(7);
    expect(r.datos.slice(0, 5).map((d) => [d.codigo, d.unidadesSalidas, d.existencia, d.rotacion])).toEqual([
      ['DEM-SIN-COSTO', 2, 3, 0.67],
      ['FRN-PAS-220', 1, 2, 0.5],
      ['BAT-12V-60', 1, 5, 0.2],
      ['LUB-0530-1L', 4, 34, 0.12],
      ['FLT-OIL-010', 1, 11, 0.09],
    ]);
    expect(r.datos.map((d) => d.codigo)).not.toContain('FLT-AIR-000');
  });

  test('rotación del mes actual', async () => {
    await sembrarBase();
    await sembrarReportes();

    const r = await consultar('rotation', 'MES_ACTUAL');
    // Incluye también las salidas del seed 005 para la orden 2 (1 filtro y 4 litros).
    expect(r.datos.slice(0, 4).map((d) => [d.codigo, d.unidadesSalidas, d.existencia, d.rotacion])).toEqual([
      ['COR-DIS-004', 1, 1, 1],
      ['BUJ-IR-001', 4, 8, 0.5],
      ['FLT-OIL-010', 3, 11, 0.27],
      ['LUB-0530-1L', 9, 34, 0.26],
    ]);
  });

  test('la exportación CSV de cada reporte se genera con los datos sembrados', async () => {
    await sembrarBase();
    await sembrarReportes();
    const token = await tokenAdmin();

    for (const reporte of ['income', 'services', 'productivity', 'parts', 'rotation']) {
      const r = await request(app)
        .get(`/api/reports/${reporte}/export?periodo=MES_ANTERIOR`)
        .set({ Authorization: `Bearer ${token}` })
        .buffer(true)
        .parse((res, cb) => {
          const trozos = [];
          res.on('data', (t) => trozos.push(t));
          res.on('end', () => cb(null, Buffer.concat(trozos)));
        });
      expect(r.status).toBe(200);
      expect(r.body.toString('utf8').split('\r\n').length).toBeGreaterThan(2);
    }
  });
});

describe('idempotencia y respeto a lo existente', () => {
  test('aplicarlo dos veces no duplica nada', async () => {
    await sembrarBase();
    await sembrarReportes();
    const primera = await conteos();

    await sembrarReportes();

    expect(await conteos()).toEqual(primera);
  });

  // Hijos de cada orden sembrada: servicios, mano de obra, usos y pagos (las salidas de
  // inventario son una por uso y llevan además una entrada de reposición sin orden).
  const HIJOS = {
    9101: { order_services: 2, order_labor: 1, order_parts: 2, payments: 2 },
    9102: { order_services: 2, order_labor: 1, order_parts: 1, payments: 1 },
    9103: { order_services: 1, order_labor: 1, order_parts: 2, payments: 2 },
    9104: { order_services: 2, order_labor: 1, order_parts: 2, payments: 2 },
    9105: { order_services: 2, order_labor: 1, order_parts: 2, payments: 1 },
    9106: { order_services: 1, order_labor: 1, order_parts: 1, payments: 1 },
    9107: { order_services: 1, order_labor: 0, order_parts: 0, payments: 0 },
  };

  test.each(IDS)('si la orden %i ya existe, se omite TODO lo suyo y se siembran las demás completas', async (id) => {
    await sembrarBase();
    await getPool().query(
      `INSERT INTO service_orders (id, client_id, vehicle_id, status, mileage_entry, reason)
       VALUES (?, 1, (SELECT id FROM vehicles WHERE plates = 'ABC-123-A'), 'RECIBIDO', 100, 'Orden real del taller')`,
      [id]
    );
    const antes = await contar('inventory_movements');

    await sembrarReportes();

    const [[orden]] = await getPool().query('SELECT reason, status FROM service_orders WHERE id = ?', [id]);
    expect(orden).toEqual({ reason: 'Orden real del taller', status: 'RECIBIDO' });
    expect(await contar('service_orders', 'id >= 9101')).toBe(7);
    for (const [otra, hijos] of Object.entries(HIJOS)) {
      for (const [tabla, esperados] of Object.entries(hijos)) {
        expect([otra, tabla, await contar(tabla, `order_id = ${otra}`)]).toEqual([otra, tabla, Number(otra) === id ? 0 : esperados]);
      }
    }
    // Una salida y una entrada por cada uso de las órdenes sembradas (20 en total).
    const sembrados = 20 - 2 * HIJOS[id].order_parts;
    expect((await contar('inventory_movements')) - antes).toBe(sembrados);
    expect(await contar('inventory_movements', `order_id = ${id}`)).toBe(0);
    // La refacción sin precio de compra pertenece a la orden 9103: sin ella tampoco se crea.
    expect(await contar('parts', "code = 'DEM-SIN-COSTO'")).toBe(id === 9103 ? 0 : 1);
  });

  test('lo que el usuario borró de una orden sembrada no regresa al volver a sembrar', async () => {
    await sembrarBase();
    await sembrarReportes();
    await getPool().query('DELETE FROM payments WHERE order_id = 9101');
    await getPool().query('DELETE FROM order_labor WHERE order_id = 9102');

    await sembrarReportes();

    expect(await contar('payments', 'order_id = 9101')).toBe(0);
    expect(await contar('order_labor', 'order_id = 9102')).toBe(0);
  });

  test('conserva lo que el usuario cambió en una orden sembrada', async () => {
    await sembrarBase();
    await sembrarReportes();
    await getPool().query("UPDATE service_orders SET reason = 'Motivo corregido por el taller' WHERE id = 9101");
    await getPool().query("UPDATE order_services SET amount = 700.00 WHERE order_id = 9101 AND description LIKE 'Cambio de aceite%'");

    await sembrarReportes();

    const [[orden]] = await getPool().query('SELECT reason FROM service_orders WHERE id = 9101');
    expect(orden.reason).toBe('Motivo corregido por el taller');
    const [[servicio]] = await getPool().query("SELECT amount FROM order_services WHERE order_id = 9101 AND description LIKE 'Cambio de aceite%'");
    expect(Number(servicio.amount)).toBe(700);
  });

  test('no pisa un mecánico real llamado mecanico2 ni su estado', async () => {
    await sembrarBase();
    await getPool().query(
      "INSERT INTO users (username, email, password_hash, full_name, role, active) VALUES ('mecanico2', 'real2@taller.mx', 'hash-real', 'Mecánico Real Dos', 'MECHANIC', 1)"
    );

    await sembrarReportes();

    const [[usuario]] = await getPool().query("SELECT full_name, active, password_hash FROM users WHERE username = 'mecanico2'");
    expect(usuario).toEqual({ full_name: 'Mecánico Real Dos', active: 1, password_hash: 'hash-real' });
  });

  test('no se rompe si faltan refacciones de los seeds previos: se omiten solo esas líneas', async () => {
    await sembrarBase();
    await getPool().query("UPDATE parts SET code = 'OTRO-CODIGO' WHERE code = 'COR-DIS-004'");

    await sembrarReportes();

    expect(await contar('service_orders', 'id >= 9101')).toBe(7);
    expect(await contar('order_parts', 'order_id = 9105')).toBe(1);
  });
});
