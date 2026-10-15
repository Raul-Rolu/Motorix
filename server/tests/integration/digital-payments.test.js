// T023: pruebas de integración del cobro digital con el simulador (US2, FR-008 a FR-010).
//
// MP_MODE=simulated: sin red ni credenciales externas (SC-008, decisión Q3).
// El sandbox real se usa solo en la demostración manual del sprint (quickstart).
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
  // Simulador interno del proveedor: sin red (SC-008).
  process.env.MP_MODE = 'simulated';
});

afterEach(async () => {
  process.env.MP_MODE = 'simulated';
  await limpiarTablas();
});

afterAll(async () => {
  await cerrarBaseDePruebas();
});

async function prepararEntorno() {
  const hash = await bcrypt.hash('Usuario123', 10);
  await getPool().query(
    'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
    ['recepcion', 'recepcion@motorix.local', hash, 'Recepción del Taller', 'RECEPTIONIST']
  );
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identificacion: 'recepcion', contrasena: 'Usuario123' });

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ fullName: 'Cliente Digital', phone: '5559998888' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'dig-001-a',
      brand: 'Mazda',
      model: 'Mazda 3',
      year: 2020,
    });

  return { token: login.body.token, vehiculoId: vehiculo.body.id };
}

async function crearOrdenConTotal(token, vehiculoId, { servicios = 1500, labor = 0 } = {}) {
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 22000, reason: 'Cobro digital' });
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [creacion.body.id, 'Servicio digital', servicios]
  );
  if (labor > 0) {
    await getPool().query(
      'INSERT INTO order_labor (order_id, description, amount) VALUES (?, ?, ?)',
      [creacion.body.id, 'Mano de obra', labor]
    );
  }
  return creacion.body.id;
}

test('el cobro digital ofrece un enlace y la verificación lo confirma (escenarios 1 y 2)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(token, vehiculoId);

  const cobro = await request(app)
    .post(`/api/orders/${orderId}/payments/digital`)
    .set('Authorization', `Bearer ${token}`)
    .send({ monto: 1500 });

  expect(cobro.status).toBe(201);
  expect(cobro.body).toMatchObject({
    id: expect.any(Number),
    estado: 'PENDING',
    monto: 1500,
    enlace: expect.stringContaining('https://'),
  });

  const verificacion = await request(app)
    .post(`/api/payments/${cobro.body.id}/verify`)
    .set('Authorization', `Bearer ${token}`);

  expect(verificacion.status).toBe(200);
  expect(verificacion.body).toMatchObject({ estado: 'COMPLETED' });

  // La orden queda liquidada y el cobrado refleja el pago confirmado.
  const listado = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  expect(listado.body).toMatchObject({
    cobrado: 1500,
    saldoPendiente: 0,
    estadoCobro: 'LIQUIDADA',
  });
});

test('solo hay un cobro digital vigente por orden (PAYMENT_DUPLICATE_PENDING)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(token, vehiculoId);

  const primero = await request(app)
    .post(`/api/orders/${orderId}/payments/digital`)
    .set('Authorization', `Bearer ${token}`)
    .send({ monto: 500 });
  expect(primero.status).toBe(201);

  const segundo = await request(app)
    .post(`/api/orders/${orderId}/payments/digital`)
    .set('Authorization', `Bearer ${token}`)
    .send({ monto: 500 });

  expect(segundo.status).toBe(409);
  expect(segundo.body.error.codigo).toBe('PAYMENT_DUPLICATE_PENDING');
});

test('la doble confirmación no duplica el importe cobrado (FR-010)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(token, vehiculoId, { servicios: 800 });

  const cobro = await request(app)
    .post(`/api/orders/${orderId}/payments/digital`)
    .set('Authorization', `Bearer ${token}`)
    .send({ monto: 800 });

  const primera = await request(app)
    .post(`/api/payments/${cobro.body.id}/verify`)
    .set('Authorization', `Bearer ${token}`);
  expect(primera.body.estado).toBe('COMPLETED');

  // Un reintento del proveedor (o un clic repetido) no admite segunda transición.
  const segunda = await request(app)
    .post(`/api/payments/${cobro.body.id}/verify`)
    .set('Authorization', `Bearer ${token}`);
  expect(segunda.status).toBe(409);
  expect(segunda.body.error.codigo).toBe('PAYMENT_NOT_MODIFIABLE');

  const listado = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  expect(listado.body.cobrado).toBe(800);

  const [[enBase]] = await getPool().query(
    'SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS suma FROM payments WHERE order_id = ?',
    [orderId]
  );
  expect(Number(enBase.total)).toBe(1);
  expect(Number(enBase.suma)).toBe(800);
});

test('un cobro digital antiguo pasa a EXPIRED y no cuenta como cobro (FR-009, SC-007)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(token, vehiculoId, { servicios: 900 });

  const cobro = await request(app)
    .post(`/api/orders/${orderId}/payments/digital`)
    .set('Authorization', `Bearer ${token}`)
    .send({ monto: 900 });

  // Simula un cobro creado hace 3 días sin confirmar.
  await getPool().query(
    "UPDATE payments SET created_at = DATE_SUB(NOW(), INTERVAL 3 DAY) WHERE id = ?",
    [cobro.body.id]
  );

  const verificacion = await request(app)
    .post(`/api/payments/${cobro.body.id}/verify`)
    .set('Authorization', `Bearer ${token}`);
  expect(verificacion.status).toBe(200);
  expect(verificacion.body.estado).toBe('EXPIRED');

  // El expirado no cuenta ni liquida la orden; el cobro manual sigue libre.
  const listado = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  expect(listado.body).toMatchObject({
    cobrado: 0,
    saldoPendiente: 900,
    estadoCobro: 'PENDIENTE',
  });

  const manual = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: 900 });
  expect(manual.status).toBe(201);
});

test('un fallo del proveedor responde MP_PROVIDER_ERROR sin registrar pagos (escenario 5)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(token, vehiculoId);

  const fetchOriginal = globalThis.fetch;
  process.env.MP_MODE = 'sandbox';
  process.env.MP_ACCESS_TOKEN = '';
  // Stub determinista: la red del proveedor no responde (sin salir a internet).
  globalThis.fetch = async () => {
    throw new Error('red no disponible');
  };

  try {
    const fallo = await request(app)
      .post(`/api/orders/${orderId}/payments/digital`)
      .set('Authorization', `Bearer ${token}`)
      .send({ monto: 1500 });

    expect(fallo.status).toBe(502);
    expect(fallo.body.error.codigo).toBe('MP_PROVIDER_ERROR');
  } finally {
    globalThis.fetch = fetchOriginal;
    process.env.MP_MODE = 'simulated';
  }

  const [[enBase]] = await getPool().query(
    'SELECT COUNT(*) AS total FROM payments WHERE order_id = ?',
    [orderId]
  );
  expect(Number(enBase.total)).toBe(0);
});
