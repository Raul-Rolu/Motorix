// 008-configuracion-seguridad-reportes, T079 (bloque P2, US6; FR-018, CA-25): las
// consultas usan parámetros y las entradas se validan en el backend. Se envían
// cargas típicas de inyección SQL a TODOS los parámetros de búsqueda y de ruta de
// los `GET` existentes y al inicio de sesión: nunca debe haber errores 500, ni
// trazas, ni mensajes de SQL, ni demoras (SLEEP), ni resultados que delaten una
// consulta alterada, y las tablas deben quedar intactas. Corre contra `motorix_test`.
//
// Parámetros de búsqueda y de ruta enumerados de `server/controllers/*.js` y
// `server/routes/*.js` (se enumeran en las listas de abajo):
//   consulta: `texto` y `fecha` (citas), `texto` y `estado` (órdenes), `q` y
//   `pending-price` (refacciones), `vehicleId` y `status` (mantenimientos),
//   `order` (historial del vehículo), `incluirInactivos` (clientes y catálogo),
//   `orderId` (propuesta) y los filtros de la bitácora; ruta: `:id` de clientes,
//   vehículos, órdenes, citas, usuarios, refacciones, pagos y tickets.
import request from 'supertest';
import bcrypt from 'bcrypt';
import { crearApp } from '../../app.js';
import {
  prepararBaseDePruebas,
  limpiarTablas,
  cerrarBaseDePruebas,
} from '../helpers/db-test.js';
import { getPool } from '../../config/db.js';

const app = crearApp();

beforeAll(async () => {
  await prepararBaseDePruebas();
});

afterEach(async () => {
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

const CLAVE = 'Usuario123';

const CARGAS = [
  "' OR 1=1 --",
  "' OR '1'='1",
  '"; DROP TABLE users; --',
  "'; DELETE FROM clients; --",
  "' UNION SELECT password_hash FROM users --",
  '1; SELECT SLEEP(5)',
  '${7*7}',
  '%',
  '_',
  '\\',
];
/** Cargas con comillas: como búsqueda de texto no deben coincidir con nada. */
const CARGAS_CON_COMILLAS = CARGAS.filter((carga) => /['"]/.test(carga));

const TABLAS_VIGILADAS = ['users', 'clients', 'vehicles', 'service_orders', 'parts', 'appointments', 'maintenance_plans', 'payments'];

async function prepararEntorno() {
  const hash = await bcrypt.hash(CLAVE, 10);
  const [admin] = await getPool().query(
    "INSERT INTO users (username, email, password_hash, full_name, role) VALUES ('admin', 'admin@motorix.local', ?, 'Administrador', 'ADMIN')",
    [hash]
  );
  const token = (await request(app).post('/api/auth/login').send({ identificacion: 'admin', contrasena: CLAVE })).body.token;

  const [cliente] = await getPool().query('INSERT INTO clients (full_name, phone) VALUES (?, ?)', ['Cliente Inyección', '5550001111']);
  const [vehiculo] = await getPool().query(
    'INSERT INTO vehicles (client_id, plates, brand, model, year) VALUES (?, ?, ?, ?, ?)',
    [cliente.insertId, 'INY-001-A', 'Nissan', 'Versa', 2020]
  );
  const [orden] = await getPool().query(
    "INSERT INTO service_orders (client_id, vehicle_id, mileage_entry, reason) VALUES (?, ?, 1000, 'Prueba')",
    [cliente.insertId, vehiculo.insertId]
  );
  await getPool().query("INSERT INTO parts (name, code, stock, min_stock) VALUES ('Filtro de aire', 'FLT-INY', 5, 1)");
  await getPool().query(
    "INSERT INTO maintenance_plans (vehicle_id, description, target_date) VALUES (?, 'Cambio de aceite', '2027-01-01')",
    [vehiculo.insertId]
  );
  await getPool().query(
    "INSERT INTO appointments (client_id, vehicle_id, appointment_date, appointment_time, reason, status) VALUES (?, ?, CURDATE(), '10:00:00', 'Revisión', 'PROGRAMADA')",
    [cliente.insertId, vehiculo.insertId]
  );
  return { token, adminId: admin.insertId, vehiculoId: vehiculo.insertId, ordenId: orden.insertId };
}

async function conteos() {
  const resultado = {};
  for (const tabla of TABLAS_VIGILADAS) {
    const [[{ total }]] = await getPool().query(`SELECT COUNT(*) AS total FROM ${tabla}`);
    resultado[tabla] = Number(total);
  }
  return resultado;
}

const SEÑALES_DE_FUGA = /ER_[A-Z_]+|SQL syntax|sqlMessage|sqlState|at .*\.js:\d+|stack|mysql|SELECT |password_hash|\$2[aby]\$/i;

/** Envía una carga a una ruta y exige una respuesta controlada y rápida. */
async function enviar(token, ruta, { esperarVacio = false } = {}) {
  const inicio = Date.now();
  const respuesta = await request(app).get(ruta).set('Authorization', `Bearer ${token}`);
  const duracion = Date.now() - inicio;

  expect({ ruta, status: respuesta.status }).toEqual({ ruta, status: expect.any(Number) });
  expect({ ruta, controlada: [200, 400, 404].includes(respuesta.status) }).toEqual({ ruta, controlada: true });
  expect({ ruta, filtra: SEÑALES_DE_FUGA.test(JSON.stringify(respuesta.body ?? {})) }).toEqual({ ruta, filtra: false });
  expect({ ruta, lenta: duracion > 3000 }).toEqual({ ruta, lenta: false });
  if (esperarVacio && respuesta.status === 200) {
    expect({ ruta, resultados: respuesta.body.datos?.length ?? 0 }).toEqual({ ruta, resultados: 0 });
  }
  return respuesta;
}

describe('parámetros de búsqueda (consulta)', () => {
  /** [descripción, plantilla con {c} para la carga codificada, ¿una carga con comillas debe dar 0 resultados?] */
  const BUSQUEDAS = [
    ['citas: texto', '/api/appointments?texto={c}', true],
    ['citas: fecha', '/api/appointments?fecha={c}', false],
    ['órdenes: texto', '/api/orders?texto={c}', true],
    ['órdenes: estado', '/api/orders?estado={c}', false],
    ['refacciones: q', '/api/parts?q={c}', true],
    ['refacciones: pending-price', '/api/parts?pending-price={c}', false],
    ['mantenimientos: vehicleId', '/api/maintenances?vehicleId={c}', false],
    ['mantenimientos: status', '/api/maintenances?status={c}', false],
    ['clientes: incluirInactivos', '/api/clients?incluirInactivos={c}', false],
    ['catálogo: incluirInactivos', '/api/service-types?incluirInactivos={c}', false],
    ['bitácora: accion', '/api/audit-log?accion={c}', false],
    ['bitácora: usuarioId', '/api/audit-log?usuarioId={c}', false],
    ['bitácora: desde', '/api/audit-log?desde={c}', false],
    ['bitácora: pagina', '/api/audit-log?pagina={c}', false],
    ['propuesta: orderId', '/api/maintenances/proposal?orderId={c}', false],
  ];

  test.each(BUSQUEDAS)('%s', async (_nombre, plantilla, vacioConComillas) => {
    const { token } = await prepararEntorno();
    const antes = await conteos();

    for (const carga of CARGAS) {
      const ruta = plantilla.replace('{c}', encodeURIComponent(carga));
      await enviar(token, ruta, { esperarVacio: vacioConComillas && CARGAS_CON_COMILLAS.includes(carga) });
    }

    expect(await conteos()).toEqual(antes);
  });

  test('el historial del vehículo: order', async () => {
    const { token, vehiculoId } = await prepararEntorno();

    for (const carga of CARGAS) {
      await enviar(token, `/api/vehicles/${vehiculoId}/history?order=${encodeURIComponent(carga)}`);
    }
  });

  test('una búsqueda legítima SÍ encuentra lo que existe (la protección no rompe la búsqueda)', async () => {
    const { token } = await prepararEntorno();

    const partes = await request(app).get('/api/parts?q=FLT-INY').set('Authorization', `Bearer ${token}`);
    const ordenes = await request(app).get('/api/orders?texto=INY-001').set('Authorization', `Bearer ${token}`);

    expect(partes.body.datos).toHaveLength(1);
    expect(ordenes.body.datos).toHaveLength(1);
  });
});

describe('parámetros de ruta (:id)', () => {
  const RUTAS = [
    ['cliente', '/api/clients/{c}'],
    ['vehículo', '/api/vehicles/{c}'],
    ['historial del vehículo', '/api/vehicles/{c}/history'],
    ['orden', '/api/orders/{c}'],
    ['pagos de la orden', '/api/orders/{c}/payments'],
    ['cita', '/api/appointments/{c}'],
    ['usuario', '/api/users/{c}'],
    ['movimientos de la refacción', '/api/parts/{c}/movements'],
    ['ticket', '/api/tickets/{c}'],
    ['pago', '/api/payments/{c}'],
  ];

  test.each(RUTAS)('%s', async (_nombre, plantilla) => {
    const { token } = await prepararEntorno();
    const antes = await conteos();

    for (const carga of CARGAS) {
      await enviar(token, plantilla.replace('{c}', encodeURIComponent(carga)));
    }

    expect(await conteos()).toEqual(antes);
  });
});

describe('inicio de sesión y cuerpos de peticiones', () => {
  test('una inyección en el usuario o la contraseña NUNCA inicia sesión', async () => {
    await prepararEntorno();

    for (const carga of CARGAS) {
      for (const cuerpo of [
        { identificacion: carga, contrasena: CLAVE },
        { identificacion: 'admin', contrasena: carga },
        { identificacion: `admin${carga}`, contrasena: carga },
      ]) {
        const respuesta = await request(app).post('/api/auth/login').send(cuerpo);

        expect([400, 401]).toContain(respuesta.status);
        expect(respuesta.body).not.toHaveProperty('token');
        expect(JSON.stringify(respuesta.body)).not.toMatch(SEÑALES_DE_FUGA);
      }
    }
  });

  test('un texto con comillas y SQL se guarda literalmente (parámetros) y las tablas quedan intactas', async () => {
    const { token } = await prepararEntorno();
    const antes = await conteos();
    const malicioso = "Robert'); DROP TABLE clients; --";

    const alta = await request(app)
      .post('/api/clients')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: malicioso, phone: '5551234567' });
    const lectura = await request(app).get(`/api/clients/${alta.body.id}`).set('Authorization', `Bearer ${token}`);

    expect(alta.status).toBe(201);
    expect(lectura.body.fullName).toBe(malicioso);
    const despues = await conteos();
    expect(despues.clients).toBe(antes.clients + 1);
    expect({ ...despues, clients: 0 }).toEqual({ ...antes, clients: 0 });
  });

  test('un cuerpo JSON mal formado responde 400 sin trazas', async () => {
    const respuesta = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"identificacion": "admin", "contrasena": ');

    expect(respuesta.status).toBe(400);
    expect(JSON.stringify(respuesta.body)).not.toMatch(SEÑALES_DE_FUGA);
  });
});

describe('filtros con formato incorrecto', () => {
  test.each([
    ['/api/appointments?fecha=2026-13-45'],
    ['/api/appointments?fecha=2026-02-31'],
    ['/api/appointments?fecha=ayer'],
    ['/api/maintenances?vehicleId=abc'],
    ['/api/orders/0'],
    ['/api/orders/-1'],
    ['/api/orders/1.5'],
    ['/api/clients/99999999999999999999'],
  ])('%s responde 400 sin error interno', async (ruta) => {
    const { token } = await prepararEntorno();

    const respuesta = await request(app).get(ruta).set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('DATOS_INVALIDOS');
  });
});
