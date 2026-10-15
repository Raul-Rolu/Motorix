// T010: pruebas de integración del registro de pagos manuales (US1, FR-001 a FR-004).
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
    .send({ fullName: 'Cliente de Cobro', phone: '5551112222' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({
      clientId: cliente.body.id,
      plates: 'cob-001-a',
      brand: 'Nissan',
      model: 'Versa',
      year: 2019,
    });

  return { token: login.body.token, vehiculoId: vehiculo.body.id };
}

/** Crea una orden y le asigna partidas por SQL para fijar su total (FR-003). */
async function crearOrdenConTotal(token, vehiculoId, { servicios = 0, labor = 0 } = {}) {
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 45120, reason: 'Trabajo de cobro' });
  const orderId = creacion.body.id;
  if (servicios > 0) {
    await getPool().query(
      'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
      [orderId, 'Cambio de aceite', servicios]
    );
  }
  if (labor > 0) {
    await getPool().query(
      'INSERT INTO order_labor (order_id, description, amount) VALUES (?, ?, ?)',
      [orderId, 'Mano de obra general', labor]
    );
  }
  return orderId;
}

test('un pago total en efectivo liquida la orden y queda asociado (escenarios 1 y 6)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(token, vehiculoId, { servicios: 1000, labor: 350 });

  const alta = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: 1350 });

  expect(alta.status).toBe(201);
  expect(alta.body).toMatchObject({
    id: expect.any(Number),
    metodo: 'CASH',
    monto: 1350,
    estado: 'COMPLETED',
  });
  expect(alta.body.registradoPor).toMatchObject({
    nombreCompleto: 'Recepción del Taller',
  });

  const listado = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);

  expect(listado.status).toBe(200);
  expect(listado.body).toMatchObject({
    total: 1350,
    cobrado: 1350,
    saldoPendiente: 0,
    estadoCobro: 'LIQUIDADA',
  });
  expect(listado.body.datos).toHaveLength(1);

  // El pago no se edita ni se elimina: solo existe como historial (FR-006).
  const [[enBase]] = await getPool().query('SELECT status, amount FROM payments WHERE id = ?', [
    alta.body.id,
  ]);
  expect(enBase).toMatchObject({ status: 'COMPLETED' });
  expect(Number(enBase.amount)).toBe(1350);
});

test('los pagos parciales muestran saldo y la orden se liquida al completarse (escenario 2)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(token, vehiculoId, { servicios: 1000, labor: 500 });

  const parcial = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'TRANSFER', monto: 800 });
  expect(parcial.status).toBe(201);

  const aMedias = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  expect(aMedias.body).toMatchObject({
    total: 1500,
    cobrado: 800,
    saldoPendiente: 700,
    estadoCobro: 'PARCIAL',
  });

  const resto = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: 700 });
  expect(resto.status).toBe(201);

  const liquidada = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  expect(liquidada.body).toMatchObject({
    cobrado: 1500,
    saldoPendiente: 0,
    estadoCobro: 'LIQUIDADA',
  });
});

test('una orden sin importes no admite pagos absurdos pero se muestra sin saldo (caso límite)', async () => {
  const { token, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrdenConTotal(token, vehiculoId);

  const listado = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`);
  // Total $0: no hay nada que cobrar, la orden se muestra liquidada (caso límite del spec).
  expect(listado.body).toMatchObject({ total: 0, cobrado: 0, saldoPendiente: 0, estadoCobro: 'LIQUIDADA' });

  const rechazo = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${token}`)
    .send({ metodo: 'CASH', monto: 100 });
  expect(rechazo.status).toBe(409);
  expect(rechazo.body.error.codigo).toBe('PAYMENT_EXCEEDS_BALANCE');
});

test('la orden inexistente responde 404 y sin token 401', async () => {
  const { token } = await prepararEntorno();

  const inexistente = await request(app)
    .get('/api/orders/9999/payments')
    .set('Authorization', `Bearer ${token}`);
  expect(inexistente.status).toBe(404);
  expect(inexistente.body.error.codigo).toBe('ORDEN_NO_ENCONTRADA');

  const sinToken = await request(app).get('/api/orders/1/payments');
  expect(sinToken.status).toBe(401);
});
