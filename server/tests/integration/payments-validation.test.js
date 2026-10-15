// T011: validaciones y permisos del registro de pagos (US1, FR-005, FR-020, RN-15).
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
  for (const [username, nombre, rol] of [
    ['admin', 'Administrador', 'ADMIN'],
    ['recepcion', 'Recepción del Taller', 'RECEPTIONIST'],
    ['mecanico', 'Mecánico del Taller', 'MECHANIC'],
  ]) {
    await getPool().query(
      'INSERT INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [username, `${username}@motorix.local`, hash, nombre, rol]
    );
  }
  const tokens = {};
  for (const username of ['admin', 'recepcion', 'mecanico']) {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ identificacion: username, contrasena: 'Usuario123' });
    tokens[username] = login.body.token;
  }

  const cliente = await request(app)
    .post('/api/clients')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ fullName: 'Cliente Validación', phone: '5553334444' });
  const vehiculo = await request(app)
    .post('/api/vehicles')
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({
      clientId: cliente.body.id,
      plates: 'val-001-a',
      brand: 'Chevrolet',
      model: 'Aveo',
      year: 2018,
    });

  return { tokens, vehiculoId: vehiculo.body.id };
}

async function crearOrden(token, vehiculoId, { estado = 'RECIBIDO', servicios = 1000, labor = 500 } = {}) {
  const creacion = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ vehicleId: vehiculoId, mileageEntry: 30100, reason: 'Validación de cobro' });
  const orderId = creacion.body.id;
  await getPool().query(
    'INSERT INTO order_services (order_id, description, amount) VALUES (?, ?, ?)',
    [orderId, 'Servicio de prueba', servicios]
  );
  await getPool().query(
    'INSERT INTO order_labor (order_id, description, amount) VALUES (?, ?, ?)',
    [orderId, 'Mano de obra', labor]
  );
  if (estado !== 'RECIBIDO') {
    await getPool().query('UPDATE service_orders SET status = ? WHERE id = ?', [estado, orderId]);
  }
  return orderId;
}

test('un monto en cero o negativo se rechaza con DATOS_INVALIDOS (400, caso límite)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrden(tokens.recepcion, vehiculoId);

  const enCero = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ metodo: 'CASH', monto: 0 });
  expect(enCero.status).toBe(400);
  expect(enCero.body.error.codigo).toBe('DATOS_INVALIDOS');

  const negativo = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ metodo: 'CASH', monto: -50 });
  expect(negativo.status).toBe(400);
  expect(negativo.body.error.mensaje).toContain('mayor que cero');
});

test('un monto mayor al saldo pendiente se rechaza con el saldo en details (409)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrden(tokens.recepcion, vehiculoId, { servicios: 1000, labor: 500 });

  const excedido = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ metodo: 'CARD', monto: 1600 });

  expect(excedido.status).toBe(409);
  expect(excedido.body.error.codigo).toBe('PAYMENT_EXCEEDS_BALANCE');
  expect(excedido.body.error.details).toMatchObject({ saldoPendiente: 1500 });
});

test('una orden cancelada rechaza pagos con ORDER_CANCELLED (409, FR-020)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrden(tokens.recepcion, vehiculoId, { estado: 'CANCELADA' });

  const rechazo = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ metodo: 'CASH', monto: 100 });

  expect(rechazo.status).toBe(409);
  expect(rechazo.body.error.codigo).toBe('ORDER_CANCELLED');

  const [[enBase]] = await getPool().query('SELECT COUNT(*) AS total FROM payments WHERE order_id = ?', [orderId]);
  expect(Number(enBase.total)).toBe(0);
});

test('el rol mecánico no puede registrar ni consultar pagos (403, RN-15)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();
  const orderId = await crearOrden(tokens.recepcion, vehiculoId);

  const registro = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${tokens.mecanico}`)
    .send({ metodo: 'CASH', monto: 100 });
  expect(registro.status).toBe(403);

  const consulta = await request(app)
    .get(`/api/orders/${orderId}/payments`)
    .set('Authorization', `Bearer ${tokens.mecanico}`);
  expect(consulta.status).toBe(403);
});

test('administración y recepción pueden registrar pagos (FR-005)', async () => {
  const { tokens, vehiculoId } = await prepararEntorno();

  const ordenAdmin = await crearOrden(tokens.admin, vehiculoId, { servicios: 400, labor: 0 });
  const conAdmin = await request(app)
    .post(`/api/orders/${ordenAdmin}/payments`)
    .set('Authorization', `Bearer ${tokens.admin}`)
    .send({ metodo: 'CASH', monto: 400 });
  expect(conAdmin.status).toBe(201);

  const ordenRecepcion = await crearOrden(tokens.recepcion, vehiculoId, { servicios: 250, labor: 0 });
  const conRecepcion = await request(app)
    .post(`/api/orders/${ordenRecepcion}/payments`)
    .set('Authorization', `Bearer ${tokens.recepcion}`)
    .send({ metodo: 'TRANSFER', monto: 250 });
  expect(conRecepcion.status).toBe(201);
});
