// 006-complemento-precios-compra, T034 (US4, FR-012, CA-7): compatibilidad de
// los pagos y tickets emitidos antes del cambio. La prueba crea sus PROPIOS
// fixtures (no depende de apply-seeds ni del seed 007): pagos manuales,
// digital COMPLETED y digital EXPIRED, más un ticket ya emitido. Tras listar,
// verificar y volver a emitir el ticket, todo se consulta igual y ninguno pasa
// a STALE. Corre contra `motorix_test` con el simulador.
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
  process.env.MP_MODE = 'simulated';
});

afterEach(async () => {
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

async function prepararFixtures() {
  const hash = await bcrypt.hash('Usuario123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['recepcion', 'recepcion@motorix.local', hash, 'Recepción del Taller', 'RECEPTIONIST']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });
  const token = login.body.token;
  const auth = { Authorization: `Bearer ${token}` };

  const cliente = await request(app)
    .post('/api/clients')
    .set(auth)
    .send({ fullName: 'Cliente Compatibilidad', phone: '5551112222' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set(auth)
    .send({
      clientId: cliente.body.id,
      plates: 'cmp-001-a',
      brand: 'Honda',
      model: 'Fit',
      year: 2018,
    });
  const orden = await request(app)
    .post('/api/orders')
    .set(auth)
    .send({ vehicleId: vehiculo.body.id, mileageEntry: 50000, reason: 'Compatibilidad' });
  const orderId = orden.body.id;
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orderId, 'Servicio histórico', 2000]
  );

  // Pagos "previos al cambio": manual, digital confirmado y digital expirado.
  await request(app).post(`/api/orders/${orderId}/payments`).set(auth).send({ metodo: 'CASH', monto: 600 });
  const digital = await request(app)
    .post(`/api/orders/${orderId}/payments/digital`)
    .set(auth)
    .send({ monto: 1400 });
  await request(app).post(`/api/payments/${digital.body.id}/verify`).set(auth);
  await getPool().query(
    `INSERT INTO payments (order_id, method, amount, status, external_reference, created_at)
     VALUES (?, 'MERCADO_PAGO', 300, 'EXPIRED', 'MP-VIEJO-1', DATE_SUB(NOW(), INTERVAL 3 DAY))`,
    [orderId]
  );
  return { auth, orderId };
}

test('los pagos previos se consultan igual y ninguno pasa a STALE (CA-7)', async () => {
  const { auth, orderId } = await prepararFixtures();

  const antes = await request(app).get(`/api/orders/${orderId}/payments`).set(auth);
  expect(antes.status).toBe(200);
  const despues = await request(app).get(`/api/orders/${orderId}/payments`).set(auth);

  expect(despues.body).toEqual(antes.body);
  expect(antes.body).toMatchObject({
    total: 2000,
    cobrado: 2000,
    saldoPendiente: 0,
    estadoCobro: 'LIQUIDADA',
  });
  const estados = antes.body.datos.map((p) => p.estado).sort();
  expect(estados).toEqual(['COMPLETED', 'COMPLETED', 'EXPIRED']);
  expect(estados).not.toContain('STALE');
  const montos = antes.body.datos.map((p) => p.monto).sort((a, b) => a - b);
  expect(montos).toEqual([300, 600, 1400]);
});

test('el ticket ya emitido conserva folio y contenido tras consultar los pagos (CA-7)', async () => {
  const { auth, orderId } = await prepararFixtures();

  const primero = await request(app).get(`/api/tickets/${orderId}`).set(auth);
  expect(primero.status).toBe(200);
  await request(app).get(`/api/orders/${orderId}/payments`).set(auth);
  const segundo = await request(app).get(`/api/tickets/${orderId}`).set(auth);

  expect(segundo.body.folio).toBe(primero.body.folio);
  expect(segundo.body).toEqual(primero.body);
  expect(primero.body).toMatchObject({ total: 2000, estadoPago: 'LIQUIDADA', saldoPendiente: 0 });
  expect(JSON.stringify(primero.body)).not.toContain('STALE');

  const [[{ total }]] = await getPool().query(
    'SELECT COUNT(*) AS total FROM tickets WHERE order_id = ?',
    [orderId]
  );
  expect(Number(total)).toBe(1);
});

test('un pago individual conserva su presentación (GET /api/payments/:id)', async () => {
  const { auth, orderId } = await prepararFixtures();
  const listado = await request(app).get(`/api/orders/${orderId}/payments`).set(auth);
  const manual = listado.body.datos.find((p) => p.metodo === 'CASH');

  const detalle = await request(app).get(`/api/payments/${manual.id}`).set(auth);
  expect(detalle.status).toBe(200);
  expect(detalle.body).toEqual(manual);
});
